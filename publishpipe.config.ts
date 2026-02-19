import { defineConfig } from "./src/config";

export default defineConfig({
  template: "sethdev",
  theme: "dark",
  variables: {
    bedrijf: "Seth van Wieringen",
    adres: "Kievitsbloemstraat 10",
    postcode: "6841 KG",
    plaats: "Arnhem",
    telefoon: " + 31 6 57104496",
    email: "hi@sethvanwieringen.eu",
    website: "sethvanwieringen.eu",
    kvknummer: "99644398",
    btwnummer: "NL005402474B27",
    iban: "NL 13 KNAB 0780938135",
    bic: "KNAB NL 2H",
  },
  page: {
    size: "A4",
    margin: "2.5cm 2cm",
  },
});
