// lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database"; 

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAR2Rbj6cw4g_ZhjqsP8PHjT8MZM4LuzM4",
  authDomain: "lab1-iscf-b8cb7.firebaseapp.com",
  databaseURL: "https://lab1-iscf-b8cb7-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "lab1-iscf-b8cb7",
  storageBucket: "lab1-iscf-b8cb7.firebasestorage.app",
  messagingSenderId: "195336324927",
  appId: "1:195336324927:web:0bab82e7db7f792e77758a",
  measurementId: "G-R065F2BC63"
};

// Initialize Firebase (using the logic for Next.js)
let firebaseApp;
if (!getApps().length) {
    firebaseApp = initializeApp(firebaseConfig);
} else {
    firebaseApp = getApps()[0]; // Use existing app
}

// Get a reference to the Realtime Database service
const database = getDatabase(firebaseApp);

// Export the database instance for use in other parts of your app
export { database };