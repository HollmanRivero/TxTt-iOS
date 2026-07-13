# TxTt2.2.2 - Et Prosjekt til Folket 🚀

<<<<<<< HEAD
TxTt er en fullstack-applikasjon strukturert med en backend i rotmappen (`/`) og en dedikert frontend-applikasjon i en undermappe. Prosjektet er designet for å være enkelt å sette opp, utvide og tilpasse etter egne behov.

---

## 🚀 Installasjon og Oppstart

Følg disse stegene for å installere og kjøre prosjektet lokalt på din maskin.

### 1. Klon depotet (Repository)
Start med å klone prosjektet til din lokale maskin:
```bash
git clone <repository-url>
cd TxTt
```

### 2. Konfigurer og start Backend (Rotmappen)
Backenden ligger direkte i rotmappen av prosjektet.

```bash
# Installer avhengigheter for backend
npm install

# Start backend-serveren
npm start
```
*(Merk: Hvis prosjektet bruker andre kommandoer som `node server.js` eller `npm run dev`, tilpass dette etter behov).*

### 3. Konfigurer og start Frontend
Gå inn i frontend-mappen (for eksempel `/frontend` eller tilsvarende navn i din struktur) for å installere og starte klienten.

```bash
# Naviger inn i frontend-mappen
cd frontend

# Installer avhengigheter for frontend
npm install

# Start frontend-applikasjonen
npm start
```

---

## 📄 Lisens og Bruksrettigheter

Dette prosjektet ble opprettet med et ønske om å dele. Det er **helt gratis** og åpent å bruke, endre, kopiere eller bygge videre på. Du kan låne kildekoden så mye du vil til dine egne prosjekter – enten det er til læring, personlig bruk eller kommersielle formål.

---

## 👤 Eier og Utvikler

Prosjektet er utviklet og eies av **Hollman Rivero**. 

Hvis du har spørsmål, opplever problemer, eller ønsker å diskutere samarbeid/tilpasninger, er det bare å ta kontakt!

### Kontaktinformasjon:
* 💬 **WhatsApp:** [Send melding direkte via WhatsApp](https://wa.me/4793672121) (Mobil: +47 936 72 121)
* 📧 **E-post:** [pepito.liindo@hotmail.com](mailto:pepito.liindo@hotmail.com)
=======
TxTt2.2.2 er en kraftfull applikasjon utviklet for å gi folk flest en gratis, sikker og effektiv måte å kommunisere på. Appen støtter fulle video- og lydsamtaler (audio og video calls), chat og deling av ressurser, og er designet for å kjøre stabilt med skybasert lagring.

Dette prosjektet er bygget med kjærlighet og dedikasjon etter tidligere tap av data, og er nå helt fullført og klart for verden!

---

## 📄 Lisens og Juridisk Eier
Dette prosjektet er utgitt under MIT-lisensen. Programvaren er **100% gratis å bruke**, men **Hollman Enrique Salazar Rivero** beholder det fulle juridiske eierskapet over kildekoden og programvaren.

* **Eier:** Hollman Enrique Salazar Rivero
* **E-post:** [personvern@bygg.salazar.no](mailto:personvern@bygg.salazar.no)
* **WhatsApp:** Kontaktes direkte via [wa/4793672121](https://wa.me/4793672121)

---

## 🔥 Hva TxTt2.2.2 er i stand til (Funksjoner)
* **Video- og lydanrop (Video & Audio Calls):** Sanntidskommunikasjon med krystallklar lyd og stabil video.
* **Skalerbar klientstruktur:** Alle brukere kan koble seg på som klienter i appen.
* **Delt Lagringskapasitet:** Det er lagt opp til en felles pott på **5000 GB (5 TB) lagring** fordelt på brukerne.
* **Personlig Familie-modus (Viktig Påminnelse):** Siden vi ikke vet nøyaktig hvor mange som laster ned appen totalt, kan den felles lagringspotten fylles opp. For å sikre deg og dine, oppfordres du til å tegne et **gratis abonnement på [supabase.com](https://supabase.com)**. Her kan du hente ut dine egne unike API-credentials (nøkler), og lime dem inn i din lokale `.env`-fil. Dette gir deg og din "app-familie" deres egne dedikerte ressurser og opptil 5000 GB gratis lagring helt uavhengig av hovedserveren!

---

## 🛠️ Installasjon og Oppsett

### Forutsetninger
Før du installerer, sørg for at du har [Node.js](https://nodejs.org/) installert på maskinen din.

### Slik kjører du prosjektet lokalt:
1.  **Klon repositoriet:**
    ```bash
    git clone [https://github.com/HollmanRivero/TxTt.git](https://github.com/HollmanRivero/TxTt.git)
    cd TxTt
    ```
2.  **Installer avhengigheter:**
    ```bash
    npm install
    ```
3.  **Konfigurer miljøvariabler:**
    Opprett en `.env`-fil i rotmappen og legg til dine Supabase-credentials.
4.  **Start applikasjonen:**
    ```bash
    npm start
    ```

---

## ⚠️ Skript-blokkering og Feilsøking (Viktig!)
Når du installerer eller kjører appen lokalt på enkelte operativsystemer (særlig Windows med PowerShell), kan det hende at systemet **blokkerer kjøring av skripter** av sikkerhetsårsaker (f.eks. `Execution_Policy` feil).

### Slik løser du skript-blokkering:
Hvis terminalen din nekter å kjøre `npm` eller andre skripter, åpne terminalen din (PowerShell) som **Administrator** og kjør følgende kommando for å tillate skripter i gjeldende sesjon:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
>>>>>>> 9a3b35cb (Initial commit: TxTt2.2.2 klar for folket med sikkerhet og dokumentasjon)
