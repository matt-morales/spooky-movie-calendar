import { db, now } from "../lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";

export function watchComments(movieId, handler) {
  const q = query(
    collection(db, "comments"),
    where("movieId", "==", movieId),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(q, (snap) => {
    handler(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addComment(movieId, uid, body) {
  await addDoc(collection(db, "comments"), {
    movieId,
    userId: uid,
    body,
    createdAt: now(),
  });
}
