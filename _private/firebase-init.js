// firebase-init.js

// 🔑 exactly the same config you use in index.html
const firebaseConfig = {
  apiKey: "AIzaSyBuOs0LRjbcqvJULZlWkUqYdrfmGIJm88w",
  authDomain: "myquranquest786.firebaseapp.com",
  projectId: "myquranquest786",
  storageBucket: "myquranquest786.appspot.com",
  messagingSenderId: "970275375391",
  appId: "1:970275375391:web:d1cac99878334834cb482a",
  measurementId: "G-KL3ZNNX844"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(err => console.error("Persistence error:", err));
}
