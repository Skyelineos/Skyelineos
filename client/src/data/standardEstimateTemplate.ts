// Skyeline's standard build estimate — line items + the number of items in a
// build, imported from the master estimate sheet. Seeds the structured
// Estimate template (Templates → Estimate → Add Standard Estimate).
// Budget per line is loaded as the unit cost (qty 1, lump-sum) so it slots
// straight into the existing estimate-template editor.

export interface StandardEstimateLine {
  description: string;
  trade: string;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;
}

export const STANDARD_ESTIMATE_LINES: StandardEstimateLine[] = [
  { description: 'Plans & Specs', trade: 'Plans & Specs', qty: 1, unit: 'ls', unitCost: 28193, total: 28193 },
  { description: 'Engineering', trade: 'Engineering', qty: 1, unit: 'ls', unitCost: 5000, total: 5000 },
  { description: 'Interior Designer', trade: 'Interior Designer', qty: 1, unit: 'ls', unitCost: 60000, total: 60000 },
  { description: 'SWPPP', trade: 'SWPPP', qty: 1, unit: 'ls', unitCost: 2000, total: 2000 },
  { description: 'Building Permit', trade: 'Building Permit', qty: 1, unit: 'ls', unitCost: 30000, total: 30000 },
  { description: 'Lot Staking/Surveying', trade: 'Lot Staking/Surveying', qty: 1, unit: 'ls', unitCost: 1000, total: 1000 },
  { description: 'Temp Water & Power', trade: 'Temp Water & Power', qty: 1, unit: 'ls', unitCost: 1000, total: 1000 },
  { description: 'Prep/Security', trade: 'Prep/Security', qty: 1, unit: 'ls', unitCost: 9000, total: 9000 },
  { description: 'Excavation', trade: 'Excavation', qty: 1, unit: 'ls', unitCost: 56128, total: 56128 },
  { description: 'Lateral Utility Hookups', trade: 'Lateral Utility Hookups', qty: 1, unit: 'ls', unitCost: 2000, total: 2000 },
  { description: 'Concrete: Footings / Foundation', trade: 'Concrete: Footings / Foundation', qty: 1, unit: 'ls', unitCost: 120000, total: 120000 },
  { description: 'Concrete: Flatwork for basement and garage floor', trade: 'Concrete: Flatwork for basement and garage floor', qty: 1, unit: 'ls', unitCost: 70000, total: 70000 },
  { description: 'Foundation Downproofing', trade: 'Foundation Downproofing', qty: 1, unit: 'ls', unitCost: 5000, total: 5000 },
  { description: 'Window Wells', trade: 'Window Wells', qty: 1, unit: 'ls', unitCost: 3000, total: 3000 },
  { description: 'Framing', trade: 'Framing', qty: 1, unit: 'ls', unitCost: 250000, total: 250000 },
  { description: 'Structural Beams', trade: 'Structural Beams', qty: 1, unit: 'ls', unitCost: 15000, total: 15000 },
  { description: 'Suspended Slab', trade: 'Suspended Slab', qty: 1, unit: 'ls', unitCost: 45000, total: 45000 },
  { description: 'Roofing', trade: 'Roofing', qty: 1, unit: 'ls', unitCost: 60000, total: 60000 },
  { description: 'Windows and Exterior Doors', trade: 'Windows and Exterior Doors', qty: 1, unit: 'ls', unitCost: 115000, total: 115000 },
  { description: 'Higgins Windows and Doors Front Door', trade: 'Higgins Windows and Doors Front Door', qty: 1, unit: 'ls', unitCost: 15000, total: 15000 },
  { description: 'Garage Doors', trade: 'Garage Doors', qty: 1, unit: 'ls', unitCost: 22000, total: 22000 },
  { description: 'Plumbing', trade: 'Plumbing', qty: 1, unit: 'ls', unitCost: 72950, total: 72950 },
  { description: 'HVAC', trade: 'HVAC', qty: 1, unit: 'ls', unitCost: 80000, total: 80000 },
  { description: 'Electrical', trade: 'Electrical', qty: 1, unit: 'ls', unitCost: 99260, total: 99260 },
  { description: 'AV', trade: 'AV', qty: 1, unit: 'ls', unitCost: 15000, total: 15000 },
  { description: 'Gas Lines', trade: 'Gas Lines', qty: 1, unit: 'ls', unitCost: 7500, total: 7500 },
  { description: 'Insulation', trade: 'Insulation', qty: 1, unit: 'ls', unitCost: 52000, total: 52000 },
  { description: 'Fireplace install', trade: 'Fireplace install', qty: 1, unit: 'ls', unitCost: 32000, total: 32000 },
  { description: 'Stone', trade: 'Stone', qty: 1, unit: 'ls', unitCost: 55000, total: 55000 },
  { description: 'Stucco/Board and Batten', trade: 'Stucco/Board and Batten', qty: 1, unit: 'ls', unitCost: 70800, total: 70800 },
  { description: 'Gutter/Soffit', trade: 'Gutter/Soffit', qty: 1, unit: 'ls', unitCost: 6912, total: 6912 },
  { description: 'Permanent Lighting', trade: 'Permanent Lighting', qty: 1, unit: 'ls', unitCost: 9072, total: 9072 },
  { description: 'Sheet Rock', trade: 'Sheet Rock', qty: 1, unit: 'ls', unitCost: 77915, total: 77915 },
  { description: 'Tile - floors', trade: 'Tile - floors', qty: 1, unit: 'ls', unitCost: 23000, total: 23000 },
  { description: 'Showers and Baths', trade: 'Showers and Baths', qty: 1, unit: 'ls', unitCost: 19440, total: 19440 },
  { description: 'Engineered Hardwood', trade: 'Engineered Hardwood', qty: 1, unit: 'ls', unitCost: 21820, total: 21820 },
  { description: 'LVP', trade: 'LVP', qty: 1, unit: 'ls', unitCost: 27293, total: 27293 },
  { description: 'Carpet', trade: 'Carpet', qty: 1, unit: 'ls', unitCost: 8584, total: 8584 },
  { description: 'Interior Doors / Finish Trim', trade: 'Interior Doors / Finish Trim', qty: 1, unit: 'ls', unitCost: 140000, total: 140000 },
  { description: 'Stairway', trade: 'Stairway', qty: 1, unit: 'ls', unitCost: 5000, total: 5000 },
  { description: 'Door Handles, Bathroom Rods, Mirrors, and Glass', trade: 'Door Handles, Bathroom Rods, Mirrors, and Glass', qty: 1, unit: 'ls', unitCost: 15000, total: 15000 },
  { description: 'Cabinets', trade: 'Cabinets', qty: 1, unit: 'ls', unitCost: 150000, total: 150000 },
  { description: 'Counter Tops - Granite', trade: 'Counter Tops - Granite', qty: 1, unit: 'ls', unitCost: 45000, total: 45000 },
  { description: 'Paint', trade: 'Paint', qty: 1, unit: 'ls', unitCost: 51260, total: 51260 },
  { description: 'Appliances', trade: 'Appliances', qty: 1, unit: 'ls', unitCost: 35000, total: 35000 },
  { description: 'Decks', trade: 'Decks', qty: 1, unit: 'ls', unitCost: 24260, total: 24260 },
  { description: 'Exterior Railing', trade: 'Exterior Railing', qty: 1, unit: 'ls', unitCost: 10200, total: 10200 },
  { description: 'Landsape Design', trade: 'Landsape Design', qty: 1, unit: 'ls', unitCost: 11000, total: 11000 },
  { description: 'Landscaping', trade: 'Landscaping', qty: 1, unit: 'ls', unitCost: 150000, total: 150000 },
  { description: 'Master Closet Organizers', trade: 'Master Closet Organizers', qty: 1, unit: 'ls', unitCost: 60000, total: 60000 },
  { description: 'Furniture', trade: 'Furniture', qty: 1, unit: 'ls', unitCost: 15000, total: 15000 },
  { description: 'Decorative Beams and Play Area for grandkids in basement', trade: 'Decorative Beams and Play Area for grandkids in basement', qty: 1, unit: 'ls', unitCost: 50000, total: 50000 },
  { description: 'Pool', trade: 'Pool', qty: 1, unit: 'ls', unitCost: 50000, total: 50000 },
  { description: 'Gym, Courts, Solar', trade: 'Gym, Courts, Solar', qty: 1, unit: 'ls', unitCost: 5000, total: 5000 },
  { description: 'Driveways/Walkways/Patios', trade: 'Driveways/Walkways/Patios', qty: 1, unit: 'ls', unitCost: 15290, total: 15290 },
  { description: 'Contingency', trade: 'Contingency', qty: 1, unit: 'ls', unitCost: 75000, total: 75000 },
  { description: 'Final Cleaning', trade: 'Final Cleaning', qty: 1, unit: 'ls', unitCost: 3075, total: 3075 },
  { description: 'Contractor Fee', trade: 'Contractor Fee', qty: 1, unit: 'ls', unitCost: 250000, total: 250000 },
];
