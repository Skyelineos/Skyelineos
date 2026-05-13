import { collection, addDoc, getDocs, query, serverTimestamp, where, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Skyeline Homes' subcontractor + vendor rolodex, hand-extracted from
// Tyler's office Subcontractor_List PDF. Each entry has the minimum needed
// to slot the company into the Contacts list — trade, company name, and at
// least one of email/phone/contact name. W9 / license / insurance
// compliance metadata is intentionally omitted; that can be filled in
// per-contact via the Contacts UI later.
//
// The seeder skips entries that already exist (matched by company name
// case-insensitive) so it's safe to re-run.

interface SubSeed {
  name: string;        // contact name (person) OR company if no contact known
  company: string;
  trade: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPhone?: string;
}

// Trade strings match what the bid-package + Contacts trade selector use.
// Where the PDF has compound trades (e.g. "Concrete: Flatwork") we keep
// the colon — the trade combobox already free-accepts strings.
const SUBCONTRACTORS: SubSeed[] = [
  // ── Appliances ───────────────────────────────────────────────────────────
  { name: 'Jack',            company: 'Diamond Appliance Group', trade: 'Appliances', email: 'jack@diamondappliancegroup.com', phone: '732-615-8799' },
  { name: 'Brittany Herzog', company: 'MLD',                     trade: 'Appliances', email: 'brittany@mld.com',                phone: '(801) 860-2224' },
  { name: 'Sarah Christensen', company: 'RC Willey',             trade: 'Appliances', email: 'sarah.christensen@rcwilley.com',  phone: '(801) 350-1797' },

  // ── Brick ───────────────────────────────────────────────────────────────
  { name: 'Capitol Exteriors', company: 'Capitol Exteriors',     trade: 'Brick',      email: 'accounts@capitolexteriors.com',   address: '5526 W 13400 S #326 Herriman UT 84096' },
  { name: 'Luis Hernandez',  company: 'LH Masonry',              trade: 'Brick',      email: 'luishernandez@lhmasonryllc.com',  phone: '(801) 358-2116' },
  { name: 'Bryant',          company: 'Praus Construction',       trade: 'Brick',      phone: '385-895-7377' },
  { name: 'Publio',          company: 'Publio Exteriors',         trade: 'Brick',      email: 'publio1967@icloud.com',           phone: '(801) 404-0510' },

  // ── Cabinets ─────────────────────────────────────────────────────────────
  { name: 'Moi Mazariegos',  company: '4M Painting & Drywall',    trade: 'Cabinets',   email: '4mpaintinganddrywall@gmail.com',  phone: '(801) 227-4838', contactPhone: '(801) 427-9344' },
  { name: 'Tyler Swanson',   company: 'Arlun',                    trade: 'Cabinets',   email: 'tyler.swanson@arlun.com',         phone: '(385) 377-4119', address: '9746 S 500 W Sandy UT 84070' },
  { name: 'Jeff Norman',     company: 'Cabinets Southwest',       trade: 'Cabinets',   email: 'jnorman@cabinetssouthwest.com' },
  { name: 'Carlisle Building', company: 'Carlisle Building',      trade: 'Cabinets',   email: 'jdog.carlisle@gmail.com' },
  { name: 'Matt Caron',      company: 'Caron Custom Cabinets',    trade: 'Cabinets',   email: 'matt@caroncabinets.com',          phone: '(801) 404-3589' },
  { name: 'Olesya Richards', company: 'Carriage House Mill',      trade: 'Cabinets',   email: 'olesya@chmill.com',               phone: '(801) 371-8610', contactPhone: '(540) 246-8228' },
  { name: 'Andrew Haral',    company: 'Collins Custom Cabinetry', trade: 'Cabinets',   email: 'andrew@tcgutah.com',              address: '11538 S State ST STE 400 Draper UT 84020' },
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Cabinets',   email: 'jerryh@cuttingedgeut.com',        phone: '(801) 893-2625' },
  { name: 'Derek Girdler',   company: 'Manor Cabinetry',          trade: 'Cabinets',   email: 'derek@manorsg.com',               phone: '(801) 892-5550', contactPhone: '(801) 518-0088' },
  { name: 'Maple Landing',   company: 'Maple Landing',            trade: 'Cabinets',   email: 'mli@maplelanding.com' },
  { name: 'Gabriel Kelsch',  company: 'Peppermint Cabinets',      trade: 'Cabinets',   email: 'gabe@peppermintcabinets.com',     phone: '(385) 831-9655' },
  { name: 'Robertson Cabinets', company: 'Robertson Cabinets',    trade: 'Cabinets',   email: 'robertsoncabinets@gmail.com',     address: '580 Rocky Mountain Drive Alpine UT 84004' },
  { name: 'Brian Hansen',    company: 'Rocky Mountain Closet & Cabinet', trade: 'Cabinets', phone: '(801) 375-5000' },
  { name: 'The Cabinet Gallery', company: 'The Cabinet Gallery',  trade: 'Cabinets',   email: 'info@tcgutah.com',                address: '11538 State Street #400' },
  { name: 'Jacob Webb',      company: 'Webb Cabinetry Design',    trade: 'Cabinets',   email: 'jacob@webbcabinetrydesign.com',   phone: '435-421-4243' },

  // ── Carpet / Engineered Hardwood ─────────────────────────────────────────
  { name: 'Tyler Swanson',   company: 'Arlun',                    trade: 'Carpet',     email: 'tyler.swanson@arlun.com',         phone: '(385) 377-4119', address: '9746 S 500 W Sandy UT 84070' },
  { name: 'Brent Belliston', company: 'Design West',              trade: 'Carpet',     email: 'brent@designwestine.com',         phone: '(801) 224-0265', contactPhone: '(801) 367-4777' },
  { name: 'Travis Holland',  company: 'Mountain West Wholesale Flooring', trade: 'Carpet', email: 'mountainwestfloors@gmail.com', phone: '(801) 361-0959', address: '564 W 700 S #402 Pleasant Grove UT 84062' },
  { name: 'SS Flooring',     company: 'SS Flooring dba Footprints Floors Utah County', trade: 'Carpet', address: '299 W Willow Creek Dr Saratoga Springs UT 84045' },

  // ── Concrete (flatwork / footings / self-leveling / driveways) ──────────
  { name: 'Stephanie',       company: 'A-Core Concrete',          trade: 'Concrete: Flatwork',  email: 'Stephanie@a-core.com' },
  { name: 'Lee Maynard',     company: 'Coyote Construction',      trade: 'Concrete: Flatwork',  email: 'leemaynard8@icloud.com',   phone: '(801) 318-9901', address: '832 W 1450 S Springville UT 84663' },
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Concrete: Flatwork',  email: 'jerryh@cuttingedgeut.com', phone: '(801) 893-2625' },
  { name: 'Oswaldo',         company: 'Oswaldo',                  trade: 'Concrete: Flatwork',  phone: '801-680-5752' },
  { name: 'Tracy',           company: 'ACS Concrete',             trade: 'Concrete: Footings / Foundation', email: 'tracy@acsonline.biz' },
  { name: 'Jeff Dumas',      company: 'Jeff Dumas Concrete Construction LLC', trade: 'Concrete: Footings / Foundation', email: 'megan@jeffdumasconcrete.com', phone: '(801) 703-5390', address: 'PO Box 575792 Salt Lake City UT 84157' },
  { name: 'Stephanie',       company: 'A-Core Concrete',          trade: 'Concrete: Self Leveling', email: 'Stephanie@a-core.com' },
  { name: 'Stephanie',       company: 'A-Core Concrete',          trade: 'Driveways / Walkways / Patios', email: 'Stephanie@a-core.com' },

  // ── Content Creation ─────────────────────────────────────────────────────
  { name: 'Gio',             company: 'Giovani Ramirez',          trade: 'Content Creation', address: '37 E 200 N Orem UT 84057' },
  { name: 'Korben Monroe',   company: 'Korben Monroe',            trade: 'Content Creation', email: 'korben.monroe@gmail.com',  phone: '(801) 376-5742' },

  // ── Counter Tops ─────────────────────────────────────────────────────────
  { name: 'Brandon Page',    company: 'BC Countertops',           trade: 'Counter Tops', email: 'brandon.bccountertops@gmail.com', phone: '(801) 628-0604', address: '1517 West 960 North Orem UT 84057' },
  { name: 'Tony Parkinson',  company: 'Bedrock Quartz',           trade: 'Counter Tops', email: 'tony.parkinson@bedrockquartz.com', phone: '801-282-2322', contactPhone: '385-253-3826' },
  { name: 'Steve Wilmarth',  company: 'Black Granite Countertops', trade: 'Counter Tops', email: 'sw@blackgranite.us',           phone: '(801) 971-7714' },
  { name: 'Cosmo Surfaces',  company: 'Cosmo Surfaces',           trade: 'Counter Tops' },
  { name: 'Nav',             company: 'GS Granite',               trade: 'Counter Tops', phone: '(801) 886-0777' },
  { name: 'Edgar Gonzalez',  company: 'Infiniti Stone',           trade: 'Counter Tops', email: 'infiniti.stone21@gmail.com',   phone: '(801) 548-4286' },
  { name: 'Arturo Carranza', company: 'Lamanita Granite LLC',     trade: 'Counter Tops', email: 'lamanita.granite.countertops@gmail.com', phone: '(385) 695-9478', contactPhone: '(801) 637-7294' },

  // ── Doors / Glass / Mirrors ──────────────────────────────────────────────
  { name: 'Jones Paint & Glass', company: 'Jones Paint & Glass',  trade: 'Door Handles, Bathroom Rods, Mirrors, Glass' },
  { name: 'Tyler Wasden',    company: 'Outlaw Glass and Hardware', trade: 'Door Handles, Bathroom Rods, Mirrors, Glass', email: 'outlawglasshardware@gmail.com', phone: '(180) 167-1824', address: '767 N Auto Mall Dr American Fork UT 84003' },

  // ── Electrical ───────────────────────────────────────────────────────────
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Electrical', email: 'jerryh@cuttingedgeut.com', phone: '(801) 893-2625' },
  { name: 'Ryan Roberts',    company: 'ER Electric',              trade: 'Electrical', email: 'ryan.erelectric@gmail.com', address: '10969 N 6330 W Highland UT 84003' },
  { name: 'Kevin',           company: 'Kbar Electric',            trade: 'Electrical', email: 'kbarelectric@gmail.com',    phone: '(801) 809-5074' },
  { name: 'Jeff Woerner',    company: 'On The Grid Electric',     trade: 'Electrical', email: 'onthegridelectric@gmail.com', phone: '(801) 420-3198' },
  { name: 'Ryan Roberts',    company: 'Ryan Roberts Electric',    trade: 'Electrical', email: 'ryan.erelectric@gmail.com', phone: '(801) 360-3591' },
  { name: 'Tyler Rhoton',    company: 'Skyridge Electric',        trade: 'Electrical', email: 'skyridgeelectrical@gmail.com', phone: '(208) 403-5905' },

  // ── Engineering ──────────────────────────────────────────────────────────
  { name: 'J Barker',        company: 'Focus Engineering & Surveying', trade: 'Engineering', email: 'jbarker@focus-esl.com', phone: '(801) 352-0075' },
  { name: 'Redwood Engineering', company: 'Redwood Engineering',  trade: 'Engineering' },

  // ── Excavation ───────────────────────────────────────────────────────────
  { name: 'Bronze Cody',     company: 'B.D. Cody Excavation LLC', trade: 'Excavation', email: 'bcodyx@gmail.com',          phone: '(801) 310-5632', address: '557 N 300 W Mapleton UT 84664' },
  { name: 'Chris Olsen',     company: 'Cooper Con',               trade: 'Excavation', email: 'chris@coopercon.net',       phone: '(801) 822-8832' },
  { name: 'Dig Forward',     company: 'Dig Forward Excavation',   trade: 'Excavation', address: '1034 E 2250 N Lehi UT 84043' },
  { name: 'Jackson Excavation', company: 'Jackson Excavation',    trade: 'Excavation' },
  { name: 'Scott',           company: 'Jeff Dumas Excavating LLC', trade: 'Excavation', email: 'eliteut@aol.com',          phone: '(801) 787-7830' },
  { name: 'Tyler',           company: 'JT Digs',                  trade: 'Excavation', email: 'tyler@jtdigs.com',          address: '767 S Automall Dr 2' },
  { name: 'Oswaldo',         company: 'Oswaldo',                  trade: 'Excavation', phone: '801-680-5752' },

  // ── Exterior Railing ─────────────────────────────────────────────────────
  { name: 'Scott Riley',     company: 'Alpine Custom Fabrication', trade: 'Exterior Railing', email: 'scott@alpinecustomfab.com', phone: '(385) 625-7092' },
  { name: 'Beckstead Metals', company: 'Beckstead Metals',        trade: 'Exterior Railing', email: 'becksteadmetals@gmail.com', address: '22111 N 11750 E Fairview UT 84629' },
  { name: 'Cole Morley',     company: 'High Country Metal Works', trade: 'Exterior Railing', email: 'cole@highcountrymetalworks.com', phone: '(801) 210-9103' },
  { name: 'Sam Maddox',      company: 'Maddox Metalworx',         trade: 'Exterior Railing', email: 'maddoxmetalworx@gmail.com', phone: '(385) 339-0993' },

  // ── Final Cleaning ───────────────────────────────────────────────────────
  { name: 'Aida Cleaning',   company: 'Aida Cleaning',            trade: 'Final Cleaning' },
  { name: 'Bee Neat Cleaning Co', company: 'Bee Neat Cleaning Co', trade: 'Final Cleaning', email: 'info@beeneatcleaningco.com', address: '171 N Palomino Way Lehi UT 84043' },

  // ── Fireplace ────────────────────────────────────────────────────────────
  { name: 'Adam B',          company: 'Hearth and Home',          trade: 'Fireplace Install', email: 'adamb@hhdu.com',       address: '1007 S 1700 W Ogden UT 84404' },

  // ── Foundation Damp-Proofing ─────────────────────────────────────────────
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Foundation Damp-Proofing', email: 'jerryh@cuttingedgeut.com', phone: '(801) 893-2625' },
  { name: 'J&P Berry',       company: 'J&P Berry',                trade: 'Foundation Damp-Proofing', email: 'jpconst05@gmail.com',  address: 'PO Box 250 Cedar Valley UT 84013' },
  { name: 'Niagara Waterproofing', company: 'Niagara Waterproofing', trade: 'Foundation Damp-Proofing', address: '925 S 200 E Orem UT 84058' },
  { name: 'Will Durbin',     company: 'Sparks Concrete Coatings', trade: 'Foundation Damp-Proofing', email: 'sales@sparkscoatings.com', phone: '(435) 849-8611' },

  // ── Framing ──────────────────────────────────────────────────────────────
  { name: 'Moi Mazariegos',  company: '4M Painting & Drywall',    trade: 'Framing',    email: '4mpaintinganddrywall@gmail.com', phone: '(801) 227-4838' },
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Framing',    email: 'jerryh@cuttingedgeut.com',     phone: '(801) 893-2625' },
  { name: 'MC Framing',      company: 'MC Framing',               trade: 'Framing',    address: '2961 S Richards View Rd Magna UT 84044' },
  { name: 'Erasmo Munoz',    company: 'Utah Framing',             trade: 'Framing',    email: 'utahframingco@gmail.com' },
  { name: 'Mike Jensen',     company: 'Western Timber Frame',     trade: 'Framing',    email: 'mike@westerntimberframe.com',  phone: '(801) 331-6690' },

  // ── Furniture ────────────────────────────────────────────────────────────
  { name: 'Bailee Nebekar',  company: 'American Homestead Furniture', trade: 'Furniture', email: 'bailee@americanhomesteadfurnitures.com', phone: '(801) 836-5632' },
  { name: 'Tracy Behunin',   company: 'Art De Coeur',             trade: 'Furniture',  email: 'artdecoeur@me.com',           phone: '(801) 867-8880' },
  { name: 'Lodon Anderson',  company: 'Hue & Hem Bespoke Furniture', trade: 'Furniture', email: 'design@huehem.com',         phone: '(801) 407-9446' },

  // ── Garage Doors ─────────────────────────────────────────────────────────
  { name: 'Skyler',          company: 'A Plus Garage Doors',      trade: 'Garage Doors', email: 'support@aplusdoor.com',     phone: '801-447-1449' },
  { name: 'Mike Davidson',   company: 'Lowry Doors',              trade: 'Garage Doors', email: 'davidson@lowrydoors.com',   phone: '(385) 337-9308' },
  { name: 'Breann Hart',     company: 'Overhead Door',            trade: 'Garage Doors', email: 'breann@ohdutah.com',        phone: '(801) 906-9295', contactPhone: '(801) 851-5724' },
  { name: 'Precision Closets and Garage', company: 'Precision Closets and Garage', trade: 'Garage Doors', address: '1375 S 500 E Suite 113 American Fork UT 84003' },
  { name: 'SunPro',          company: 'SunPro',                   trade: 'Garage Doors', email: 'dkauwe@sunpro.build',       phone: '(801) 885-8145' },
  { name: 'Chad Blackhurst', company: 'Vidor Door',               trade: 'Garage Doors', email: 'chad.blackhurst@vidordoor.com' },
  { name: 'Daniel Merryweather', company: 'Whitecap Enterprises', trade: 'Garage Doors', email: 'dmerryweather@whitecapllc.net', phone: '(385) 224-4128', address: '564 W 700 S Unit 201 Pleasant Grove UT 84062' },

  // ── Gas Lines ────────────────────────────────────────────────────────────
  { name: 'Dayton',          company: 'Waite Heating & Cooling',  trade: 'Gas Lines',  email: 'outbackcamper78@gmail.com' },

  // ── Gym / Courts ─────────────────────────────────────────────────────────
  { name: 'Ace Coatings',    company: 'Ace Coatings',             trade: 'Gym / Courts', email: 'info@acecoatingsutah.com', phone: '(385) 269-0060' },
  { name: 'Empresa Floors',  company: 'Empresa Floors',           trade: 'Gym / Courts', email: 'kylee@empireflooringutah.com' },
  { name: 'Grant Tingey',    company: 'Grit Courts',              trade: 'Gym / Courts', email: 'grant@builtwithgrit.com', phone: '(801) 899-9787' },
  { name: 'Aaron Parkes',    company: 'Invision Home Design',     trade: 'Gym / Courts', email: 'aaron@invisionhomedesign.com' },
  { name: 'Pickleball Pros', company: 'Pickleball Pros',          trade: 'Gym / Courts', email: 'pickleballproscourts@gmail.com', phone: '(435) 527-4000' },

  // ── HVAC ────────────────────────────────────────────────────────────────
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'HVAC',       email: 'jerryh@cuttingedgeut.com',   phone: '(801) 893-2625' },
  { name: 'Dillon Fugate',   company: 'Dillon Fugate',            trade: 'HVAC',       email: 'fugatedillon3@gmail.com',    phone: '(406) 679-5812' },
  { name: 'Rob',             company: 'First Choice Heating and Air', trade: 'HVAC',   email: '1stchoicecool@gmail.com',    phone: '(801) 842-7086', address: '14382 S Heritage View Cove Bluffdale UT 84065' },
  { name: 'Skyline Plumbing and Mechanical', company: 'Skyline Plumbing and Mechanical', trade: 'HVAC', email: 'skylineplumb@gmail.com', phone: '(801) 766-1711' },
  { name: 'Jose Lopez',      company: 'Utah Mechanical and Services', trade: 'HVAC',   email: 'joselopezhvac0024@gmail.com', address: '2348 N Cherry Circle Saratoga Springs UT 84045' },

  // ── Insulation ───────────────────────────────────────────────────────────
  { name: 'Dallas Shaw',     company: 'Hone Insulation',          trade: 'Insulation', email: 'dshaw@honeinsulation.com',   phone: '(801) 560-7735' },
  { name: 'SunPro',          company: 'SunPro',                   trade: 'Insulation', email: 'dkauwe@sunpro.build' },
  { name: 'Daniel Merryweather', company: 'Whitecap Enterprises', trade: 'Insulation', email: 'dmerryweather@whitecapllc.net', phone: '(385) 224-4128', address: '564 W 700 S Unit 201 Pleasant Grove UT 84062' },

  // ── Interior Design ──────────────────────────────────────────────────────
  { name: 'Kelsey Crandall', company: 'Alika Design',             trade: 'Interior Design', email: 'hello@alikadesign.com', phone: '(801) 960-5611' },
  { name: 'Allison Campbell', company: 'Allison Campbell',        trade: 'Interior Design', email: 'acdesign.ut@gmail.com', phone: '(801) 372-3413' },
  { name: 'Kelcey Andrus',   company: 'Aloe and Elm Interiors',   trade: 'Interior Design', email: 'aloeandelm.interiors@gmail.com', phone: '(801) 518-0242' },
  { name: 'Heather',         company: 'Hansen Design Firm',       trade: 'Interior Design', email: 'heather@hansendesignfirm.com' },
  { name: 'Natalie N Bills', company: 'New View Design',          trade: 'Interior Design', email: 'natalie@newviewdesign-utah.com', phone: '(385) 539-5057' },
  { name: 'Jessica Crandall', company: 'Remedy Design Firm',      trade: 'Interior Design', email: 'jessica@remedy2design.com', phone: '(801) 822-3579' },
  { name: 'Nicole Rhoton',   company: 'Skyeline Design',          trade: 'Interior Design', email: 'skyelinedesigncenter@gmail.com' },

  // ── Interior Doors / Finish Trim ─────────────────────────────────────────
  { name: 'Moi Mazariegos',  company: '4M Painting & Drywall',    trade: 'Interior Doors / Finish Trim', email: '4mpaintinganddrywall@gmail.com', phone: '(801) 227-4838' },
  { name: 'Aaron',           company: 'Awesome Trimwork',         trade: 'Interior Doors / Finish Trim', email: 'aaron@aweseometrimwork.com', address: '539 N 900 E Orem UT 84097' },
  { name: 'Finish Right Construction', company: 'Finish Right Construction', trade: 'Interior Doors / Finish Trim', email: 'finishr8@gmail.com', address: '5924 S Cami Dawn Court Kearns UT 84118' },
  { name: 'Wade',            company: 'Full Curl Carpentry',      trade: 'Interior Doors / Finish Trim', email: 'wade@fullcurlcarpentry.com', address: '1324 Trinnaman Lane Lehi UT 84043' },
  { name: 'Leonardo Matos',  company: 'Leonardo Matos',           trade: 'Interior Doors / Finish Trim', email: 'leomatos.construction@gmail.com', phone: '(385) 500-8437' },
  { name: 'Rich Lewis',      company: 'Rich Lewis Finish Carpentry', trade: 'Interior Doors / Finish Trim', email: 'rich@rjlewisinc.com', phone: '(801) 592-1168' },

  // ── Landscaping ──────────────────────────────────────────────────────────
  { name: 'AF Landscaping Group', company: 'AF Landscaping Group, LLC', trade: 'Landscaping', address: '1333 S Valley Grove Way Suite 285 Pleasant Grove UT 84062' },
  { name: 'Megan Palmer',    company: 'Frederico Outdoor Living', trade: 'Landscaping', email: 'megan@fredericooutdoor.com', phone: '(801) 652-9959' },
  { name: 'Jackson Hinckley', company: 'J&H Landscaping',         trade: 'Landscaping', email: 'jackson@jh-landscapes.com', phone: '(801) 472-7062' },
  { name: 'Jake Sasser',     company: 'MD Property Services',     trade: 'Landscaping', email: 'jakes@mdpropertyinc.com',   phone: '(801) 473-7878', address: '947 South 500 East #100 American Fork UT 84003' },
  { name: 'Mike Trotter',    company: 'Trotter Landscaping',      trade: 'Landscaping', phone: '(801) 687-1697' },
  { name: 'Luis Uribe',      company: 'Utah Professional Lawn Care', trade: 'Landscaping', email: 'contact@uplawncare.com', phone: '(801) 310-8730' },

  // ── Lot Staking / Surveying ──────────────────────────────────────────────
  { name: 'Bill Turner',     company: 'Bill Turner Geotech (CMT Technical Services)', trade: 'Lot Staking / Surveying', email: 'bill.turner@cmttechnicalservices.com', phone: '(801) 870-6731' },
  { name: 'Dudley and Associates', company: 'Dudley and Associates', trade: 'Lot Staking / Surveying' },
  { name: 'J Barker',        company: 'Focus Engineering & Surveying', trade: 'Lot Staking / Surveying', email: 'jbarker@focus-esl.com', phone: '(801) 352-0075' },

  // ── Master Closet Organizers ─────────────────────────────────────────────
  { name: 'Closets By Design', company: 'Closets By Design',      trade: 'Master Closet Organizers' },
  { name: 'Bill Bernardi',   company: 'Cutting Edge Closets & Design', trade: 'Master Closet Organizers', email: 'bill@ceclosets.com', phone: '(801) 225-6050', contactPhone: '(801) 735-8940', address: '1015 S 1680 W Orem UT 84059' },
  { name: 'Precision Closets and Garage', company: 'Precision Closets and Garage', trade: 'Master Closet Organizers', address: '1375 S 500 E Suite 113 American Fork UT 84003' },
  { name: 'Brian Hansen',    company: 'Rocky Mountain Closet & Cabinet', trade: 'Master Closet Organizers', phone: '(801) 375-5000', contactPhone: '(801) 691-6502' },

  // ── Other / Specialty ───────────────────────────────────────────────────
  { name: 'Melesa Loosle',   company: 'A-Plus Elevators & Lifts', trade: 'Other',      email: 'melesa.loosle@aplusconnection.com', phone: '(385) 707-3901' },
  { name: 'Jase Frandsen',   company: 'A1 Safe and Vault Company', trade: 'Other',     email: 'jayson@jaseproductions.net' },
  { name: 'Denny Palmer',    company: 'Cam Seal Pro',             trade: 'Other',      phone: '(801) 495-2391' },
  { name: 'Elevated Waste Solutions', company: 'Elevated Waste Solutions', trade: 'Other', phone: '(801) 372-0039' },
  { name: 'Enevive',         company: 'Enevive',                  trade: 'Other',      email: 'support@enevive.com',         phone: '(801) 993-0080' },
  { name: 'Exspeedia Transport', company: 'Exspeedia Transport LLC', trade: 'Other',   address: 'PO Box 1053 Springville UT 84663' },
  { name: 'Trent Willemin',  company: 'Family Tire Pros of Utah', trade: 'Other',      email: 'familytireprosutah@gmail.com', phone: '(801) 940-4241' },
  { name: 'Rob Wible',       company: 'Fifth Gear AV',            trade: 'Other',      email: 'fthgear@comcast.net',         address: '492 S 130 W Orem UT 84058' },
  { name: 'Jonathan Baker',  company: 'ibuild',                   trade: 'Other',      phone: '(801) 960-5512' },
  { name: 'Jon Stubbs',      company: 'Jon Stubbs Trucking',      trade: 'Other',      phone: '(801) 428-7222' },
  { name: 'Aaron Mace',      company: 'Mace Enterprises',         trade: 'Other',      email: 'aaronmace33@hotmail.com',     phone: '(801) 369-8887' },
  { name: 'Mike Walker',     company: 'Mike Walker Trucking',     trade: 'Other',      address: 'PO Box 744 Spanish Fork UT 84660' },
  { name: 'Ryan Casper',     company: 'NuWater Technologies',     trade: 'Other',      email: 'ryan@nuwatertec.com',         phone: '(801) 671-2034' },
  { name: 'Chad Harward',    company: 'Predictive Edge Consulting', trade: 'Other',    email: 'chad@predictiveedge.com',     phone: '(801) 814-1883' },
  { name: 'Angie Briston',   company: 'Process Partners',         trade: 'Other',      email: 'angie@processpartners.biz',   phone: '(801) 477-0195' },
  { name: 'Brandon Rhoton',  company: 'RFinancial',               trade: 'Other',      address: '389 E Center St Lindon UT 84042' },
  { name: 'Supreme Plaster', company: 'Supreme Plaster',          trade: 'Other',      address: '329 W Lakeview Ct Vineyard UT 84059' },
  { name: 'Bryan Irving',    company: 'TileRam',                  trade: 'Other',      email: 'bryan@tileram.com',           phone: '(801) 707-9255', contactPhone: '(801) 652-3499' },
  { name: 'Utah Rental Manager', company: 'Utah Rental Manager',  trade: 'Other',      address: '767 S Auto Mall Dr #2' },
  { name: 'Chris Brown',     company: 'UTTA Custom Homes',        trade: 'Other',      address: '345 S 100 E Spanish Fork UT 84660' },

  // ── Paint ────────────────────────────────────────────────────────────────
  { name: 'Moi Mazariegos',  company: '4M Painting & Drywall',    trade: 'Paint',      email: '4mpaintinganddrywall@gmail.com', phone: '(801) 227-4838' },
  { name: 'Christopher Guerrieri', company: 'Christopher Painting', trade: 'Paint',    email: 'chris@christopherpainting.com', phone: '(847) 530-5975' },
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Paint',      email: 'jerryh@cuttingedgeut.com',    phone: '(801) 893-2625' },
  { name: 'Matthew Miner',   company: 'Epit Painting Company',    trade: 'Paint',      phone: '801-875-2584' },
  { name: 'Hector Mucino',   company: 'HM Professional Painting', trade: 'Paint',      email: 'hmprofessionalpainting@gmail.com', address: '121 E River Bend Rd Saratoga Springs UT 84045' },
  { name: 'Jones Paint & Glass', company: 'Jones Paint & Glass',  trade: 'Paint' },
  { name: 'Spencer Fuhriman', company: 'Keeba Painting',          trade: 'Paint',      email: 'paintingrevolutionetc@gmail.com', phone: '(801) 910-5388', address: '4746 W Lone View CT West Jordan UT 84088' },
  { name: 'Carlos',          company: 'Painting Revolution',      trade: 'Paint',      email: 'paintingrevolutionetc@gmail.com', phone: '(801) 971-7714' },
  { name: 'Easton Tallon',   company: 'Tallon Painting',          trade: 'Paint',      email: 'tallonpainting@gmail.com',    phone: '(801) 787-5604' },
  { name: 'Jose Ramos',      company: 'Tauro Painting',           trade: 'Paint',      email: 'tauropaintingutah@gmail.com', phone: '(801) 500-9430' },
  { name: 'Marla Phillips',  company: 'Wasatch Wallpaper',        trade: 'Paint',      email: 'wallpapermama@gmail.com',     address: '422 West 900 North American Fork UT 84003' },

  // ── Plans & Specs ────────────────────────────────────────────────────────
  { name: 'Heather',         company: 'Hansen Design Firm',       trade: 'Plans & Specs', email: 'heather@hansendesignfirm.com' },
  { name: 'Jace',            company: 'Legacy Drafting and Design', trade: 'Plans & Specs', email: 'jace@legacydraftinganddesign.com', address: '962 W 800 N Orem UT 84057' },
  { name: 'Stone Casting and Design', company: 'Stone Casting and Design', trade: 'Plans & Specs' },

  // ── Plumbing ─────────────────────────────────────────────────────────────
  { name: 'B&M Plumbing',    company: 'B&M Plumbing',             trade: 'Plumbing',   email: 'bandmplumbingut@gmail.com' },
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Plumbing',   email: 'jerryh@cuttingedgeut.com',   phone: '(801) 893-2625' },
  { name: 'Go 2 Plumbers',   company: 'Go 2 Plumbers',            trade: 'Plumbing' },
  { name: 'Frank Hatch',     company: 'Imperial Plumbing',        trade: 'Plumbing',   email: 'imperialplumbingutah@yahoo.com', phone: '(801) 362-7988' },
  { name: 'Boe Jasper',      company: 'Jasper Plumbing',          trade: 'Plumbing',   email: 'jasperplumbinginc@gmail.com', phone: '(801) 404-6949', address: '1798 N Cedar Hollow Drive Lehi UT 84043' },
  { name: 'Noble Plumbing',  company: 'Noble Plumbing',           trade: 'Plumbing',   email: 'gwn563@protonmail.com',      phone: '(385) 204-2793', address: '1618 N Geneva Rd Provo UT 84601' },
  { name: 'Paramount Plumbing', company: 'Paramount Plumbing',    trade: 'Plumbing',   email: 'paramountjesse@gmail.com',   address: '1296 E Wheatland Dr Eagle Mountain UT 84005' },
  { name: 'Teri Webb',       company: 'Peterson Plumbing',        trade: 'Plumbing',   email: 'teri@petersonplumbingsupply.com', phone: '(385) 349-9689', contactPhone: '(801) 434-9700' },
  { name: 'Skyline Plumbing', company: 'Skyline Plumbing and Mechanical', trade: 'Plumbing', email: 'skylineplumb@gmail.com', phone: '(801) 766-1711' },
  { name: 'Told Plumbing',   company: 'Told Plumbing',            trade: 'Plumbing' },

  // ── Pool ────────────────────────────────────────────────────────────────
  { name: 'Jose Ruiz',       company: 'Awesome Pools and Spas',   trade: 'Pool',       email: 'ruizbuildingteams@gmail.com', phone: '(801) 513-4089' },
  { name: 'Desert Pools',    company: 'Desert Pools Construction LLC', trade: 'Pool' },

  // ── Prep / Security ──────────────────────────────────────────────────────
  { name: 'Ironclad Services', company: 'Ironclad Services',      trade: 'Prep / Security' },
  { name: 'Royal Solutions', company: 'Royal Solutions',          trade: 'Prep / Security', email: 'etb.llc.ut@gmail.com' },

  // ── Roofing ──────────────────────────────────────────────────────────────
  { name: 'Chris Streams',   company: 'Babe Roof',                trade: 'Roofing',    email: 'baberoofcorp@yahoo.com',      phone: '(516) 458-6048' },
  { name: 'Best Quality Roofing', company: 'Best Quality Roofing', trade: 'Roofing',   email: 'Bestqualityroofingllc20@gmail.com', phone: '(385) 201-4944', address: '172 E 1200 N Orem UT 84057' },
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Roofing',    email: 'jerryh@cuttingedgeut.com',    phone: '(801) 893-2625' },
  { name: 'Douglas Cooper',  company: 'Far West Roofing',         trade: 'Roofing',    email: 'doug@saltlakeroofing.com',    phone: '(801) 253-7799' },
  { name: 'Zach Gleave',     company: 'My Roof',                  trade: 'Roofing',    email: 'myroofllc@jobnimbusmail.com', phone: '(801) 603-7774', address: '1042 E 3000 N Layton UT 84040' },
  { name: 'David Brown',     company: 'Precision Roofing',        trade: 'Roofing',    email: 'jhtaxdavid@gmail.com',        phone: '(385) 505-6989' },

  // ── Sheet Rock ───────────────────────────────────────────────────────────
  { name: 'Moi Mazariegos',  company: '4M Painting & Drywall',    trade: 'Sheet Rock', email: '4mpaintinganddrywall@gmail.com', phone: '(801) 227-4838' },
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Sheet Rock', email: 'jerryh@cuttingedgeut.com',    phone: '(801) 893-2625' },
  { name: 'RC Drywall',      company: 'RC Drywall Specialists',   trade: 'Sheet Rock' },

  // ── Smart Home Installation ──────────────────────────────────────────────
  { name: 'Jereme Barnes',   company: 'All Metro Tech',           trade: 'Smart Home Installation', email: 'jereme@allmetrotech.com', phone: '(801) 330-8320' },
  { name: 'Justin Rollins',  company: 'Argenta Solutions',        trade: 'Smart Home Installation', email: 'justin@argentanow.com', phone: '(801) 996-3146' },
  { name: 'Byron Gomez',     company: 'Byron Gomez',              trade: 'Smart Home Installation', email: 'bayrongm07@gmail.com', address: '19 S 860 E Orem UT 84097' },

  // ── Solar ───────────────────────────────────────────────────────────────
  { name: 'Owen Christensen', company: 'Eave Solar',              trade: 'Solar',      email: 'owen@eavesolar.com',          phone: '(385) 417-4158' },
  { name: 'Curt Van Hove',   company: 'Suncatcher Energy',        trade: 'Solar',      email: 'curt@suncatcherenergy.com',   phone: '(801) 255-2888', address: '8967 Altair Dr Sandy UT 84093' },

  // ── Stone ───────────────────────────────────────────────────────────────
  { name: 'Capitol Exteriors', company: 'Capitol Exteriors',      trade: 'Stone',      email: 'accounts@capitolexteriors.com', address: '5526 W 13400 S #326 Herriman UT 84096' },
  { name: 'Luis Hernandez',  company: 'LH Masonry',               trade: 'Stone',      email: 'luishernandez@lhmasonryllc.com', phone: '(801) 358-2116' },
  { name: 'Bryant',          company: 'Praus Construction',        trade: 'Stone',      phone: '385-895-7377' },
  { name: 'Publio',          company: 'Publio Exteriors',          trade: 'Stone',      email: 'publio1967@icloud.com',       phone: '(801) 404-0510' },
  { name: 'Lauriann Rosenvall', company: 'Querenda Stone',        trade: 'Stone',      email: 'lrosenvall@querendastone.com', phone: '(385) 355-4066' },
  { name: 'Kami',            company: 'Rock Chuckers LLC',        trade: 'Stone',      email: 'kami@rockchuckers-utah.com',  address: '5415 W Leo Park Rd' },
  { name: 'Bernardo',        company: 'Strong Rock Pavers',       trade: 'Stone',      email: 'bernardo@strongrockpavers.com', phone: '(901) 427-9272' },

  // ── Stucco / Board & Batten ──────────────────────────────────────────────
  { name: 'Moi Mazariegos',  company: '4M Painting & Drywall',    trade: 'Stucco, Board, Batten', email: '4mpaintinganddrywall@gmail.com', phone: '(801) 227-4838' },
  { name: 'Capitol Exteriors', company: 'Capitol Exteriors',      trade: 'Stucco, Board, Batten', email: 'accounts@capitolexteriors.com', address: '5526 W 13400 S #326 Herriman UT 84096' },
  { name: 'Bernardo Salinas', company: 'Menchi Siding & Home Renovation', trade: 'Stucco, Board, Batten', email: 'menchsiding@gmail.com', phone: '(801) 660-9817' },
  { name: 'Publio',          company: 'Publio Exteriors',          trade: 'Stucco, Board, Batten', email: 'publio1967@icloud.com', phone: '(801) 404-0510' },
  { name: 'Serafini Stone',  company: 'Serafini Stone Specialties', trade: 'Stucco, Board, Batten', email: 'teoserafini2006@hotmail.com', phone: '(801) 520-1384', address: '854 S 860 E Spanish Fork UT 84660' },

  // ── SWPP / Temp Power ────────────────────────────────────────────────────
  { name: 'JT SWPP',         company: 'JT SWPP',                  trade: 'SWPP' },
  { name: 'Cody Jensen',     company: 'Temporary Power Company',  trade: 'Temp Water & Power', email: 'temporarypowercompany@gmail.com', phone: '(801) 893-2971', contactPhone: '(801) 209-4844' },

  // ── Tile ────────────────────────────────────────────────────────────────
  { name: 'Angel Aparicio',  company: 'AG House Interior',        trade: 'Tile',       email: 'moctezumaa@hotmail.com' },
  { name: 'Raul Fragoso',    company: 'X-Treme Tile',             trade: 'Tile',       email: 'xtreme.tile19@gmail.com',     phone: '(385) 630-0001' },

  // ── Window Wells ─────────────────────────────────────────────────────────
  { name: 'BCK Supply',      company: 'BCK Supply',               trade: 'Window Wells', email: 'bcksupply07@gmail.com',     phone: '(801) 361-8747' },
  { name: 'J&P Berry',       company: 'J&P Berry',                trade: 'Window Wells', email: 'jpconst05@gmail.com',       address: 'PO Box 250 Cedar Valley UT 84013' },

  // ── Windows / Exterior Doors ─────────────────────────────────────────────
  { name: 'Ben Malani',      company: 'Anderson Windows',         trade: 'Windows and Exterior Doors', phone: '(801) 372-9770' },
  { name: 'Jerry Hinckley',  company: 'Cutting Edge Enterprises', trade: 'Windows and Exterior Doors', email: 'jerryh@cuttingedgeut.com', phone: '(801) 893-2625' },
  { name: 'Beaaux',          company: 'Epic Windows and Doors',   trade: 'Windows and Exterior Doors', phone: '801-645-9125' },
  { name: 'Lance Yates',     company: 'Higgins Windows and Doors', trade: 'Windows and Exterior Doors', email: 'glassbyhiggins@gmail.com', phone: '801-592-0187' },
  { name: 'Dale Kunkel',     company: 'Iron Door Utah',           trade: 'Windows and Exterior Doors', email: 'dale@irondoorutah.com', phone: '(801) 663-1199' },
  { name: 'Shane Halliday',  company: 'Moyes Glass',              trade: 'Windows and Exterior Doors', email: 's.halliday@moyesglass.com', phone: '801-822-2843' },
  { name: 'Jim Jenkins',     company: 'Pella Windows',            trade: 'Windows and Exterior Doors', email: 'Jenkinsja@pellamw.com', phone: '(801) 787-5999' },
  { name: 'Paul Legere',     company: 'Pella Windows & Doors',    trade: 'Windows and Exterior Doors', email: 'plegere@pellawd.com', phone: '(385) 223-2012', contactPhone: '(385) 518-0939' },
  { name: 'Rocky Mountain Windows', company: 'Rocky Mountain Windows and Doors', trade: 'Windows and Exterior Doors' },
  { name: 'Tanner Uncles',   company: 'Soniq Windows and Glass',  trade: 'Windows and Exterior Doors', email: 'tanner@soniqslc.com', phone: '(801) 913-4694', address: '3669 W 800 S Salt Lake City 84104' },
  { name: 'John Valdez',     company: 'Vista Windows & Doors',    trade: 'Windows and Exterior Doors', email: 'johnv@vistawindowsutah.com', phone: '(801) 718-4188', address: '1483 S Major St Salt Lake City UT 84115' },
  { name: 'Taylor Patterson', company: 'Vzion Glass',             trade: 'Windows and Exterior Doors', email: 'taylor@vzionglass.com', phone: '(801) 651-0118' },
  { name: 'Ben Wothe',       company: 'Western Window Systems',   trade: 'Windows and Exterior Doors', email: 'bwothe@westernws.com', phone: '(612) 816-9406' },

  // ── No Trade / Misc (W9 list at end of PDF) ──────────────────────────────
  { name: 'Apenisa Colati Ciwabati Malani', company: 'Apenisa Colati Ciwabati Malani', trade: 'Other', address: '824 S 620 E Heber City UT 84032' },
  { name: 'Arnoldsen Construction', company: 'Arnoldsen Construction', trade: 'Other', address: '5360 S Riley Lane Murray UT 84107' },
  { name: 'Best Care Landscaping', company: 'Best Care Landscaping & Design', trade: 'Landscaping', address: '13 N 400 E Lindon UT 84042' },
  { name: 'Bex Construction', company: 'Bex Construction',         trade: 'Other',      email: 'ap@mikewalkertrucking.com', address: '853 E 300 N Spanish Fork UT 84660' },
  { name: 'Dorothy Larson',  company: 'Dorothy Larson',            trade: 'Other',      email: 'dorothylarson@gmail.com',   address: '412 S 2060 W Orem UT 84059' },
  { name: 'Emco Masonry',    company: 'Emco Masonry',              trade: 'Brick',      address: '1745 S Freestone Blvd Santaquin UT 84655' },
  { name: 'Erick Donaldo Torres', company: 'Erick Donaldo Torres', trade: 'Other',      address: '4545 S Atherton Dr Apt 143 Taylorsville UT 84123' },
  { name: 'Grandview Builders', company: 'Grandview Builders LLC', trade: 'Other',      address: '12478 S Luzerne Ct Herriman UT 84096' },
  { name: 'Hector Mucino',   company: 'Hector Mucino',             trade: 'Paint',      address: '121 E River Bend Rd Saratoga Springs UT 84045' },
  { name: 'High Desert Earthworks', company: 'High Desert Earthworks', trade: 'Excavation', address: '676 N 600 E' },
  { name: 'Jolene Gressman', company: 'Jolene Gressman',           trade: 'Other',      address: 'PO Box 422 Goshen UT 84633' },
  { name: 'Jorge Montiel Olmos', company: 'Jorge Montiel Olmos',  trade: 'Framing',    address: '1638 N Geneva Rd Provo UT 84601' },
  { name: 'Jose Manuel Hernandez Lozada', company: 'Jose Manuel Hernandez Lozada', trade: 'Framing', address: '1638 N Geneva Rd Provo UT 84601' },
  { name: 'JT Worx',         company: 'JT Worx',                   trade: 'Other',      address: '522 E Rue Hugo Vineyard UT 84059' },
  { name: 'Juan Pablo Pedraza Hernandez', company: 'Juan Pablo Pedraza Hernandez', trade: 'Framing', address: '1638 N Geneva Rd Provo UT 84601' },
  { name: 'King Royal',      company: 'King Royal Companies',      trade: 'Other',      address: '3984 S 2000 W Spanish Fork UT 84660' },
  { name: 'Luis Caballero',  company: 'Luis Caballero',            trade: 'Sheet Rock', email: 'caballerodrywall@gmail.com', address: '736 S 300 W Lehi UT 84043' },
  { name: 'Luzvin Ruano',    company: 'Luzvin Ruano',              trade: 'Other',      email: 'luzvinantonio1985@gmail.com', address: '208 E 1130 S Lehi UT 84043' },
  { name: 'Marco Ayala',     company: 'Marco Ayala',               trade: 'Other',      address: '5072 N University Ave #103 Provo UT 84604' },
  { name: 'Chase Adams',     company: 'Nicoha Construction',       trade: 'Other',      email: 'cadams@nicoha.com',          phone: '(385) 338-3806', contactPhone: '(801) 888-6032' },
  { name: 'Oscar Veliz',     company: 'Oscar Veliz',               trade: 'Other',      address: '1427 W Dairy Lane Lindon UT 84042' },
  { name: 'RDK Construction', company: 'RDK Construction LLC',     trade: 'Other',      address: '6199 S 2800 W Spanish Fork UT 84660' },
  { name: 'Utah Green Mountain', company: 'Utah Green Mountain Construction', trade: 'Other', address: '208 E 1130 S Lehi UT 84043' },
  { name: 'Viturino Candia', company: 'Viturino Candia',           trade: 'Other',      address: '1594 W 400 S #110 Salt Lake City UT 84104' },
];

export interface SeedResult {
  attempted: number;
  added: number;
  skipped: number;
  mergedTrades: number;
  errors: number;
  tradesAdded: number;
}

// Bulk-add the Skyeline subcontractor list to Firestore. Idempotent on both
// sides: existing contacts (matched by company name) and existing trades
// (matched by name) are skipped, so re-running this is safe.
export async function seedSkyelineSubcontractors(createdBy?: string): Promise<SeedResult> {
  // ─── Pass 1: seed trades ────────────────────────────────────────────────
  // The Contacts > Trades list is sourced from the `trades` collection.
  // Ensure every trade present in the subcontractor seed exists there so
  // the trade combobox + filters know about it.
  const tradesSnap = await getDocs(collection(db, 'trades'));
  const existingTradeNames = new Set<string>();
  tradesSnap.forEach(d => {
    const n = (d.data() as any).name;
    if (typeof n === 'string') existingTradeNames.add(n.trim().toLowerCase());
  });
  const uniqueTrades = Array.from(new Set(SUBCONTRACTORS.map(s => s.trade).filter(Boolean)));
  let tradesAdded = 0;
  for (const tradeName of uniqueTrades) {
    const key = tradeName.trim().toLowerCase();
    if (existingTradeNames.has(key)) continue;
    try {
      await addDoc(collection(db, 'trades'), {
        name: tradeName,
        description: 'Added by Skyeline subcontractor import',
        category: 'Construction',
        isActive: true,
        createdAt: serverTimestamp(),
        createdBy: createdBy ?? null,
      });
      existingTradeNames.add(key);
      tradesAdded += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Trade seed failed for', tradeName, e);
    }
  }

  // ─── Pass 2: consolidate seed rows by company ──────────────────────────
  // Many companies (Cutting Edge Enterprises, 4M Painting & Drywall, Capitol
  // Exteriors…) span multiple trades in the source PDF. We merge those into
  // a single contact whose `trades` array carries every trade they cover so
  // the bid-package modal surfaces them for each one.
  const consolidated = new Map<string, {
    name: string;
    company: string;
    email: string;
    phone: string;
    contactPhone: string;
    address: string;
    trades: string[];
  }>();
  const longerOf = (a: string, b: string) => (a && a.length >= b.length ? a : b);
  for (const s of SUBCONTRACTORS) {
    const key = s.company.trim().toLowerCase();
    const existing = consolidated.get(key);
    if (!existing) {
      consolidated.set(key, {
        name: s.name,
        company: s.company,
        email: s.email || '',
        phone: s.phone || '',
        contactPhone: s.contactPhone || '',
        address: s.address || '',
        trades: [s.trade],
      });
    } else {
      // Merge fields — keep the longest non-empty value of each.
      existing.email = longerOf(existing.email, s.email || '');
      existing.phone = longerOf(existing.phone, s.phone || '');
      existing.contactPhone = longerOf(existing.contactPhone, s.contactPhone || '');
      existing.address = longerOf(existing.address, s.address || '');
      if (!existing.trades.includes(s.trade)) existing.trades.push(s.trade);
    }
  }

  // ─── Pass 3: seed contacts ──────────────────────────────────────────────
  const existingSnap = await getDocs(query(collection(db, 'contacts'), where('role', '==', 'subcontractor')));
  const existingByCompany = new Map<string, { id: string; trades: string[] }>();
  existingSnap.forEach(d => {
    const data = d.data() as any;
    const c = String(data.company || data.name || '').trim().toLowerCase();
    const existingTrades: string[] = Array.isArray(data.trades) ? data.trades.filter((t: any) => typeof t === 'string') : [];
    existingByCompany.set(c, { id: d.id, trades: existingTrades });
  });

  let added = 0, skipped = 0, mergedTrades = 0, errors = 0;
  for (const [key, c] of consolidated) {
    const existing = existingByCompany.get(key);
    if (existing) {
      // Already in contacts — extend the trades array if this seed has any
      // they're missing. This keeps re-runs useful: editing the seed file
      // to add a new trade for a company will now back-fill onto the
      // existing contact instead of being skipped.
      const missing = c.trades.filter(t => !existing.trades.includes(t));
      if (missing.length > 0) {
        try {
          const updatedTrades = [...existing.trades, ...missing];
          await updateDoc(doc(db, 'contacts', existing.id), {
            trades: updatedTrades,
            // Keep the legacy single-trade field in sync with the first entry.
            trade: existing.trades[0] || updatedTrades[0],
            updatedAt: serverTimestamp(),
          });
          mergedTrades += missing.length;
        } catch (e) {
          errors += 1;
          // eslint-disable-next-line no-console
          console.error('Trade merge failed for', c.company, e);
        }
      } else {
        skipped += 1;
      }
      continue;
    }
    try {
      await addDoc(collection(db, 'contacts'), {
        name: c.name,
        company: c.company,
        email: c.email,
        phone: c.phone,
        contactPhone: c.contactPhone,
        address: c.address,
        role: 'subcontractor',
        trade: c.trades[0],
        trades: c.trades,
        isActive: true,
        hasPortalAccess: false,
        notes: 'Imported from Skyeline subcontractor list',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: createdBy ?? null,
      });
      added += 1;
    } catch (e) {
      errors += 1;
      // eslint-disable-next-line no-console
      console.error('Seed failed for', c.company, e);
    }
  }

  return {
    attempted: consolidated.size,
    added,
    skipped,
    mergedTrades,
    errors,
    tradesAdded,
  };
}

export const SKYELINE_SUBCONTRACTOR_COUNT = SUBCONTRACTORS.length;
