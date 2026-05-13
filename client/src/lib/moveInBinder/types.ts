// Move-in Binder = the dossier handed to the client at substantial completion.
// Tracks every appliance / mechanical / finish that has maintenance or a
// warranty, plus the sub who installed it so the homeowner has a single
// place to look up "who do I call about my furnace?"

export type BinderCategory =
  | 'appliance'
  | 'mechanical'      // HVAC, water heater, water softener, etc.
  | 'finish'          // Flooring, paint, cabinets, countertops
  | 'fixture'         // Faucets, sinks, lighting
  | 'exterior'        // Siding, roofing, garage doors
  | 'systems'         // Smart home, AV, security, irrigation
  | 'other';

export interface BinderItem {
  id: string;
  projectId: string;
  category: BinderCategory;
  name: string;                // "Wolf 36" range" / "Trane XR16 HVAC unit"
  brand?: string;
  model?: string;
  serial?: string;
  retailer?: string;           // Where it was purchased
  installerContactId?: string; // Link to contact (sub or vendor)
  installerName?: string;      // Snapshot in case contact is deleted later
  installDate?: string;        // ISO yyyy-mm-dd
  warrantyExpires?: string;    // ISO date
  warrantyTermYears?: number;  // 1 / 2 / 5 / 10 / lifetime → years
  manualUrl?: string;
  notes?: string;
  registered?: boolean;        // Has the client registered the warranty?
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}

export const CATEGORY_LABEL: Record<BinderCategory, string> = {
  appliance:  'Appliance',
  mechanical: 'Mechanical / Systems',
  finish:     'Finish',
  fixture:    'Fixture',
  exterior:   'Exterior',
  systems:    'Smart Home / AV',
  other:      'Other',
};

export const CATEGORY_ORDER: BinderCategory[] = [
  'appliance', 'mechanical', 'fixture', 'finish', 'exterior', 'systems', 'other',
];
