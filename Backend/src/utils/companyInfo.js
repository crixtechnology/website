// Server-side mirror of Frontend/src/data/content.js's `site` export — kept
// here too because the receipt PDF is now built in two places (the browser,
// for the "Download Receipt" button, and here, for the emailed copy) and the
// backend has no access to the Frontend's own data file (separate app).
// Keep these two in sync by hand if the company's registered details change.
const COMPANY = {
  legalName: "Crix Technology Private Limited",
  cin: "U63122GJ2026PTC179737",
  registeredAddress: "G-403, Jalaram Vatika, Nr. Sadguru Bunglows, New Maninagar, Ramol, Daskroi, Ahmedabad – 382449, Gujarat",
  email: "crixtechnology@gmail.com",
  phone: "+91 97232 23588",
  website: "https://crixtechnology.in",
};

module.exports = { COMPANY };
