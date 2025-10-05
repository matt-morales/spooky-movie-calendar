import { db, now } from "../lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getAggregateFromServer,
  average,
  count,
} from "firebase/firestore";

const docId = (movieId, uid) => `${movieId}_${uid}`;

export async function setRating(movieId, uid, value) {
  const ref = doc(db, "ratings", docId(movieId, uid));
  await setDoc(
    ref,
    {
      movieId,
      userId: uid,
      value,
      updatedAt: now(),
      createdAt: now(),
    },
    { merge: true },
  );
}

export async function getMyRating(movieId, uid) {
  const snap = await getDoc(doc(db, "ratings", docId(movieId, uid)));
  return snap.exists() ? snap.data().value : null;
}

export async function getRatingSummary(movieId) {
  const q = query(collection(db, "ratings"), where("movieId", "==", movieId));
  const agg = await getAggregateFromServer(q, {
    avg: average("value"),
    total: count(),
  });
  return {
    average: agg.data().avg ?? 0,
    count: agg.data().total ?? 0,
  };
}
