/**
 * useFirestore(collectionName, ...queryConstraints)
 *
 * Real-time subscription to a Firestore collection.
 * Returns { data, loading, error }.
 *
 * Each item in `data` has the Firestore document id injected as `item.id`.
 *
 * ── READ-QUOTA OPTIMISATION ──
 * Listeners are shared and cached at module level. Navigating between pages
 * re-uses the cached data instantly (0 reads). A listener is kept alive for
 * KEEP_ALIVE_MS after the last component unmounts, so quick page switches never
 * re-query. While a listener stays open, Firestore only bills for documents that
 * actually change.
 *
 * Usage examples:
 *   const { data, loading } = useFirestore('product');
 *
 *   import { where, orderBy } from 'firebase/firestore';
 *   const { data } = useFirestore('product',
 *     where('showOnPos', '==', true),
 *     orderBy('name')
 *   );
 */

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, queryEqual } from 'firebase/firestore';
import { db } from '../firebase';

// How long to keep a listener open after the last subscriber leaves.
const KEEP_ALIVE_MS = 30 * 60 * 1000;

// Registry of shared entries: { q, state, subscribers:Set, unsub, timer }
const entries = [];

function getEntry(collectionName, constraints) {
  const ref = collection(db, collectionName);
  const q = constraints.length ? query(ref, ...constraints) : ref;

  let entry = entries.find(e => queryEqual(e.q, q));
  if (entry) return entry;

  entry = {
    q,
    state: { data: [], loading: true, error: null },
    subscribers: new Set(),
    unsub: null,
    timer: null,
  };
  const publish = (patch) => {
    entry.state = { ...entry.state, ...patch };
    entry.subscribers.forEach(fn => fn(entry.state));
  };
  entry.unsub = onSnapshot(
    q,
    (snapshot) => publish({
      data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })),
      loading: false,
      error: null,
    }),
    (err) => {
      console.error(`[useFirestore] ${collectionName}:`, err);
      publish({ error: err.message, loading: false });
      // Drop failed entry so a later mount can retry
      entry.unsub?.();
      const i = entries.indexOf(entry);
      if (i >= 0) entries.splice(i, 1);
    },
  );
  entries.push(entry);
  return entry;
}

export function useFirestore(collectionName, ...constraints) {
  const [state, setState] = useState(() =>
    collectionName
      ? getEntry(collectionName, constraints).state
      : { data: [], loading: false, error: null },
  );

  useEffect(() => {
    if (!collectionName) return;

    const entry = getEntry(collectionName, constraints);
    clearTimeout(entry.timer);
    entry.subscribers.add(setState);
    setState(entry.state); // instant cached value

    return () => {
      entry.subscribers.delete(setState);
      if (entry.subscribers.size === 0) {
        entry.timer = setTimeout(() => {
          entry.unsub?.();
          const i = entries.indexOf(entry);
          if (i >= 0) entries.splice(i, 1);
        }, KEEP_ALIVE_MS);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName]);

  return state;
}
