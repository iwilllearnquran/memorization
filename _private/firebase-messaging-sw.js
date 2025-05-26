// public/_private/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBuOs0LRjbcqvJULZlWkUqYdrfmGIJm88w",
    authDomain: "myquranquest786.firebaseapp.com",
    projectId: "myquranquest786",
    storageBucket: "myquranquest786.appspot.com",
    messagingSenderId: "970275375391",
    appId: "1:970275375391:web:d1cac99878334834cb482a",
    measurementId: "G-KL3ZNNX844"
  };

// Initialize Firebase
// Check if Firebase is already initialized to avoid re-initialization
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}


const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title, { body, icon });
});
