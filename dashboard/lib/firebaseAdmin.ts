import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth"
import { getApps } from "firebase-admin/app";


let admin_app;
if (!getApps().length) {
    admin_app = initializeApp()
} else {
    admin_app = getApps()[0];
}
const admin_auth = getAuth(admin_app)

export { admin_app, admin_auth }
