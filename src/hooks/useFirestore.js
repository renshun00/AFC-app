/**
 * useFirestore(collectionName, ...queryConstraints)
 *
 * Real-time subscription to a Firestore collection.
 * Returns { data, loading, error }.
 *
 * Each item in `data` has the Firestore document id injected as `item.id`.
 * The listener is automatically cleaned up on unmount.
 *
 * Usage examples:
 *   // All products
 *   const { data, loading } = useFirestore('product');
 *
 *   // Only active POS items, ordered by name
 *   import { where, orderBy } from 'firebase/firestore';
 *   const { data } = useFirestore('product',
 *     where('showOnPos', '==', true),
 *     where('isActive', '==', true),
 *     orderBy('name')
 *   );
 */

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useFirestore(collectionName, ...constraints) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!collectionName) return;

    const ref = collection(db, collectionName);
    const q   = constraints.length ? query(ref, ...constraints) : ref;

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[useFirestore] ${collectionName}:`, err);
        setError(err.message);
        setLoading(false);
      },
    );

    return unsub;

  }, [collectionName]);

  return { data, loading, error };
}
