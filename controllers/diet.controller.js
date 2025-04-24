const Food = require('../models/food.model');
const { filterFoods, selectTopFoods } = require('../utils/dietAlgorithm');

// Scoring function to calculate the score based on the goal
const scoreFood = (food, goal) => {
  let score = 0;

  const kcal = food.unit_serving_energy_kcal || 0;
  const protein = food.unit_serving_protein_g || 0;
  const carbs = food.unit_serving_carb_g || 0;
  const fat = food.unit_serving_fat_g || 0;
  const fibre = food.unit_serving_fibre_g || 0;
  const sugar = food.unit_serving_freesugar_g || 0;
  const sfa = (food.unit_serving_sfa_mg || 0) / 1000;

  if (goal === 'Weight Gain') {
    if (kcal > 150) score += 2;
    else if (kcal > 100) score += 1;
    if (protein > 7) score += 2;
    else if (protein > 5) score += 1;
    if (carbs > 10) score += 2;
    if (fat >= 5 && fat <= 15) score += 1;
    if (fibre > 1) score += 1;
    if (sfa > 5) score -= 1;
    if (sugar > 8) score -= 1;
  }

  if (goal === 'Weight Loss') {
    if (kcal < 150) score += 2;
    if (protein >= 8) score += 2;
    if (carbs < 15) score += 1;
    if (fat < 10) score += 1;
    if (fibre >= 2) score += 1;
    if (sfa > 4) score -= 1;
    if (sugar > 6) score -= 1;
  }

  if (goal === 'Maintain Current Weight') {
    if (kcal >= 100 && kcal <= 200) score += 2;
    if (protein >= 6 && protein <= 12) score += 2;
    if (carbs <= 25) score += 1;
    if (fat <= 12) score += 1;
    if (fibre >= 1.5) score += 1;
    if (sfa > 5) score -= 1;
    if (sugar > 8) score -= 1;
  }

  if (goal === 'Keto Diet') {
    if (carbs < 10) score += 3;
    if (fat > 15) score += 2;
    if (protein >= 6) score += 1;
    if (sugar > 4) score -= 1;
    if (kcal > 200) score += 1;
    if (fibre > 2) score += 1;
  }

  return score;
};
//basal metabolic rate (BMR) calculation logic
const calculateBMR = ({ age, gender, height, weight }) => {
  if (gender === 'Male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
};
//real feel of the person
const getActivityFactor = (level) => {
  const factors = {
    Sedentary: 1.2,
    'Lightly active': 1.375,
    'Moderately active': 1.55,
    'Very active': 1.725,
    'Super active': 1.9,
  };
  return factors[level] || 1.2;
};
//split calorie according to goal
const adjustCaloriesByGoal = (tdee, goal) => {
  if (goal === 'Weight Loss') return tdee - 500;
  if (goal === 'Weight Gain') return tdee + 500;
  return tdee;
};
//logic for calorie distribution across meals
const splitCaloriesDynamic = (total, meals) => {
  const split = {
    Breakfast: 0.25,
    'Morning Snack': 0.1,
    Lunch: 0.3,
    'Evening Snack': 0.1,
    Dinner: 0.25,
  };

  const filtered = Object.entries(split)
    .filter(([key]) => meals.includes(key));

  const totalSplit = filtered.reduce((acc, [_, v]) => acc + v, 0);

  return Object.fromEntries(
    filtered.map(([k, v]) => [k, Math.round((v / totalSplit) * total)])
  );
};
//fallback is for conformation that Meal is generated succesfully even if the options are limited., will not give an incomplete diet plan
const selectFoodForMeal = (foods, calorieTarget) => {
  if (!foods.length) return { fallbackUsed: true, food: null };
  let bestMatch = foods.reduce((prev, curr) => {
    const diff = Math.abs((curr.unit_serving_energy_kcal || 0) - calorieTarget);
    const prevDiff = Math.abs((prev.unit_serving_energy_kcal || 0) - calorieTarget);
    return diff < prevDiff ? curr : prev;
  });
  return { fallbackUsed: false, food: bestMatch };
};

//filter by health conditions
const filterByHealthConditions = (foods, healthConditions) => {
  return foods.filter(food => {
    const sugar = food.unit_serving_freesugar_g || 0;
    const sodium = food.unit_serving_sodium_mg || 0;
    const fat = food.unit_serving_fat_g || 0;
    const cholesterol = food.unit_serving_cholesterol_mg || 0;

    if (healthConditions.includes('Diabetes') && sugar > 8) return false;
    if (healthConditions.includes('Hypertension') && sodium > 400) return false;
    if (healthConditions.includes('Heart Disease') && (fat > 15 || cholesterol > 75)) return false;
    if (healthConditions.includes('Kidney Issues') && protein > 25) return false;
    if (healthConditions.includes('Obesity') && fat > 15) return false;

    return true;
  });
};
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weeklyPlan = {};
    exports.generateDietPlan = async (req, res) => {
      try {
        const {
          age, gender, height, weight, activityLevel,
          healthGoals, dietaryPreference,
          allergies = [], mealTiming = ['Breakfast', 'Lunch', 'Dinner'],
          healthConditions = [],
        } = req.body;
    
        const userGoal = healthGoals[0];
        const bmr = calculateBMR({ age, gender, height, weight });
        const tdee = bmr * getActivityFactor(activityLevel);
        const adjustedCalories = adjustCaloriesByGoal(tdee, userGoal);
        const mealCalories = splitCaloriesDynamic(adjustedCalories, mealTiming);
        const allFoods = await Food.find({});
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const weeklyPlan = {};
        const foodUsageMap = new Map();
        //mapper function for generating meal plan for whole week taking care of redundancy
        const isFoodOverused = (foodName) => foodUsageMap.get(foodName) >= 2;
        const incrementFoodUsage = (foodName) => {
          foodUsageMap.set(foodName, (foodUsageMap.get(foodName) || 0) + 1);
        };
    
        for (let day of days) {
          weeklyPlan[day] = {};
    
          for (let meal of mealTiming) {
            let foods = allFoods.filter(food => {
              if (dietaryPreference === 'Vegetarian' && food.DietType !== 'Vegetarian') return false;
              if (dietaryPreference === 'Vegan' && food.DietType !== 'Vegan') return false;
              if (!food['Best Time to Eat'] || !food['Best Time to Eat'].includes(meal)) return false;
              if (allergies.some(a => food.food_name.toLowerCase().includes(a.toLowerCase()))) return false;
              if (isFoodOverused(food.food_name)) return false;
              return true;
            });
    
            foods = filterByHealthConditions(foods, healthConditions);
    
            let { food } = selectFoodForMeal(foods, mealCalories[meal]);
    
            if (!food) {
              // Fallback logic that avoids overused foods
              //also ensures that there is no incomplete dieat plan if the options are limited 
              const fallbackOptions = allFoods.filter(f =>
                !isFoodOverused(f.food_name) &&
                (!f['Best Time to Eat'] || f['Best Time to Eat'].includes(meal))
              );
              let fallback = selectFoodForMeal(filterByHealthConditions(fallbackOptions, healthConditions), mealCalories[meal]);
              food = fallback.food;
            }
    
            if (food) {
              incrementFoodUsage(food.food_name);
            }
    
            weeklyPlan[day][meal] = food ? [food] : [];
          }
        }
    
        res.json({
          success: true,
          bmr,
          tdee,
          adjustedCalories,
          mealCalories,
          weeklyDietPlan: weeklyPlan,
        });
    
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
      }
    };
    

exports.getDietPlan = async (req, res) => {
  try {
    const userPrefs = req.body;

    if (!userPrefs.healthGoals || !userPrefs.mealTimings) {
      return res.status(400).json({ success: false, message: 'Missing healthGoals or mealTimings in request body.' });
    }

    let allFoods = await Food.find();

    // Phase 1: Filtering based on user preferences
    const filtered = filterFoods(allFoods, userPrefs);

    // Phase 2: Selecting the top foods based on health goals and meal timings

    //missing Health Conditions based filtering
    const plan = selectTopFoods(filtered, userPrefs.healthGoals[0], userPrefs.mealTimings);

    return res.json({ success: true, dietPlan: plan });

  } catch (error) {
    console.error('Error generating diet plan:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
