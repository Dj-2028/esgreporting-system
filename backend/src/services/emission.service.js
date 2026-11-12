'use strict';

/**
 * Emissions = Activity Data × Emission Factor (backend.md §8.9, workflow.md §8.4).
 * Stateless; nothing is stored. Factors are user-supplied (illustrative).
 */
function calculate({ scope, activity_data, activity_unit, emission_factor_kg_per_unit }) {
  const kg = activity_data * emission_factor_kg_per_unit;
  const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;
  return {
    scope,
    activity_data,
    activity_unit,
    emission_factor_kg_per_unit,
    emissions_kg: round(kg, 6),
    emissions_tco2e: round(kg / 1000, 6),
    formula: 'Emissions = Activity Data × Emission Factor',
    worked: `${activity_data} ${activity_unit} × ${emission_factor_kg_per_unit} kg CO2e/${activity_unit} = ${round(kg, 6)} kg = ${round(kg / 1000, 6)} tCO2e`,
  };
}

module.exports = { calculate };

