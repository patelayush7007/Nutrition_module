const Food = require('../models/food.model');
const { filterFoods, selectTopFoods } = require('../utils/dietAlgorithm');

// Scoring function
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
// Bmr calculator
const calculateBMR = ({ age, gender, height, weight }) => {
  return gender === 'Male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
};
//activity factor check
const getActivityFactor = (level) => {
  const factors = {
    'Sedentary': 1.2,
    'Lightly active': 1.375,
    'Moderately active': 1.55,
    'Very active': 1.725,
    'Super active': 1.9,
  };
  return factors[level] || 1.2;
};
// calorie adjustment according to user goals
const adjustCaloriesByGoal = (tdee, goal) => {
  if (goal === 'Weight Loss') return tdee - 500;
  if (goal === 'Weight Gain') return tdee + 500;
  return tdee;
};

// split the calorie requirement throught the meals
const splitCaloriesDynamic = (total, meals) => {
  const split = {
    Breakfast: 0.25,
    'Morning Snack': 0.1,
    Lunch: 0.3,
    'Evening Snack': 0.1,
    Dinner: 0.25,
  };
  const filtered = Object.entries(split).filter(([k]) => meals.includes(k));

  // in the context structure , the meal is set for 5 splits , but this will be done according to the split function ,for user preference if he wants to add 4 or 3 meals per day
  const totalSplit = filtered.reduce((acc, [_, v]) => acc + v, 0); //simply adds the current meal's value to the accumulator.
  return Object.fromEntries(filtered.map(([k, v]) => [k, Math.round((v / totalSplit) * total)]));
};
// filter foods by health condition
const filterByHealthConditions = (foods, healthConditions) => {
  return foods.filter(food => {
    const sugar = food.unit_serving_freesugar_g || 0;
    const sodium = food.unit_serving_sodium_mg || 0;
    const fat = food.unit_serving_fat_g || 0;
    const cholesterol = food.unit_serving_cholesterol_mg || 0;
    const protein = food.unit_serving_protein_g || 0;

    if (healthConditions.includes('Diabetes') && sugar > 8) return false;
    if (healthConditions.includes('Hypertension') && sodium > 400) return false;
    if (healthConditions.includes('Heart Disease') && (fat > 15 || cholesterol > 75)) return false;
    if (healthConditions.includes('Kidney Issues') && protein > 25) return false;
    if (healthConditions.includes('Obesity') && fat > 15) return false;

    return true;
  });
};
// complementary item addon
const selectFoodCombo = (foods, targetCalories) => {
  foods.sort((a, b) => {
    const diffA = Math.abs((a.unit_serving_energy_kcal || 0) - targetCalories);
    const diffB = Math.abs((b.unit_serving_energy_kcal || 0) - targetCalories);
    return diffA - diffB;
  });

  // picking multiple foods to reach target
  let combo = [];
  let totalCalories = 0;

  for (let food of foods) {
    if (totalCalories + (food.unit_serving_energy_kcal || 0) <= targetCalories + 50) {
      combo.push(food);
      totalCalories += (food.unit_serving_energy_kcal || 0);
      if (totalCalories >= targetCalories - 50) break; // close enough
    }
  }

  return combo.length ? combo : foods
};


exports.generateDietPlan = async (req, res) => {
  try {
    const {
      age,
      gender,
      height,
      weight,
      activityLevel,
      healthGoals,
      dietaryPreference = '',
      allergies = [],
      mealTiming = [],
      healthConditions = [],
    } = req.body;

    const userGoal = healthGoals[0];
    const bmr = calculateBMR({ age, gender, height, weight });
    const tdee = bmr * getActivityFactor(activityLevel);
    const adjustedCalories = adjustCaloriesByGoal(tdee, userGoal);
    const mealCalories = splitCaloriesDynamic(adjustedCalories, mealTiming);

    const allFoods = await Food.find();
    const weeklyPlan = {};
    const foodUsageMap = new Map(); //mapper function for no food item is added more than twice 

    const dietaryPref = dietaryPreference.toLowerCase();
    const isFoodOverused = (name) => foodUsageMap.get(name) >= 2; // checks if the food item is used >=2
    const incrementFoodUsage = (name) => foodUsageMap.set(name, (foodUsageMap.get(name) || 0) + 1); //increments usage everytime the food item is used

    const simplifiedWeeklyPlan = {};

    for (let day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      weeklyPlan[day] = {};
      for (let meal of mealTiming) {
        let foods = allFoods.filter(food => {
          const dietType = food.diet_type?.toLowerCase() || '';
          if (dietaryPref === 'vegan' && dietType !== 'vegan') return false;
          if (dietaryPref === 'vegetarian' && !['vegan', 'veg (not vegan)'].includes(dietType)) return false;
          if (!food.best_time_to_eat?.includes(meal)) return false;
          if (allergies.some(a => food.food_name.toLowerCase().includes(a.toLowerCase()))) return false;
          if (isFoodOverused(food.food_name)) return false;
          return true;
        });

        foods = filterByHealthConditions(foods, healthConditions);

        let selectedFoods = selectFoodCombo(foods, mealCalories[meal]);

        if (!selectedFoods.length) {
          const fallbackOptions = allFoods.filter(f => {
            const type = f.diet_type?.toLowerCase() || '';
            const matchesDiet =
              dietaryPref === 'vegan' ? type === 'vegan' :
                dietaryPref === 'vegetarian' ? ['vegan', 'veg (not vegan)'].includes(type) : true;

            return matchesDiet &&
              !isFoodOverused(f.food_name) &&
              f.best_time_to_eat?.includes(meal);
          });

          const fallbackFoods = filterByHealthConditions(fallbackOptions, healthConditions);
          // if you apply all these filters and no foods are left then fallback function makes the filtration checks lite anf filters only on the basis of diet type and health condn
          selectedFoods = selectFoodCombo(fallbackFoods, mealCalories[meal]);
        }

        //SIMPLIFICATION OF DIET PLAN 
        for (const day in weeklyPlan) {
          simplifiedWeeklyPlan[day] = {};
          for (const meal in weeklyPlan[day]) {
            simplifiedWeeklyPlan[day][meal] = weeklyPlan[day][meal].map(food => ({
              food_name: food.food_name,
              primarysource: food.primarysource,
              unit_serving_energy_kcal: food.unit_serving_energy_kcal,
              energy_kcal : food.energy_kcal
            }));
          }
        }

        selectedFoods.forEach(food => incrementFoodUsage(food.food_name));
        weeklyPlan[day][meal] = selectedFoods;
      }
    }

    res.json({
      success: true,
      bmr,
      tdee,
      adjustedCalories,
      mealCalories,
      // weeklyDietPlan: weeklyPlan,
      weeklyDietPlan: simplifiedWeeklyPlan
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

