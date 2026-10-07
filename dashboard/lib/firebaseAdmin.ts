import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth"
import { getApps } from "firebase-admin/app";


let admin_app;
if (!getApps().length) {
    // Must match the project users sign into — verifyIdToken rejects tokens
    // whose `aud` differs. Signature checks use Google's public certs, so no
    // service account credential is required here.
    admin_app = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    })
} else {
    admin_app = getApps()[0];
}
const admin_auth = getAuth(admin_app)

export { admin_app, admin_auth }
