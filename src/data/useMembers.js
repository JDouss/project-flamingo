import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db, MEMBERS_COLLECTION } from "./firebase";

const DEFAULT_MEMBERS = [
  { id: "miembro_1", name: "Jaime", persona: "Analista de contexto histórico y político" },
  { id: "miembro_2", name: "Almu", persona: "Lectora emocional, centrada en la psicología de personajes" },
  { id: "miembro_3", name: "Alejandro", persona: "Crítico literario, enfocado en estructura y ritmo narrativo" },
  { id: "miembro_4", name: "Joaquin", persona: "Lector escéptico, atento a giros de guion e inconsistencias" },
  { id: "miembro_5", name: "Zepe", persona: "Bibliófilo apasionado de la metaliteratura y el libro físico" },
];

// Club member registry: name + persona hints the AI uses to map voices.
// Seeds defaults on first use (admin only — writes are rule-protected).
export function useMembers({ seedIfEmpty = false } = {}) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, MEMBERS_COLLECTION));
      let list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (list.length === 0 && seedIfEmpty) {
        await Promise.all(
          DEFAULT_MEMBERS.map((m) => setDoc(doc(db, MEMBERS_COLLECTION, m.id), m))
        );
        list = DEFAULT_MEMBERS;
      }

      list.sort((a, b) => a.id.localeCompare(b.id));
      setMembers(list);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setLoading(false);
    }
  }, [seedIfEmpty]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveMember = useCallback(async (member) => {
    const { id, name, persona } = member;
    await setDoc(doc(db, MEMBERS_COLLECTION, id), { name, persona });
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, name, persona } : m)));
  }, []);

  return { members, loading, refresh, saveMember };
}
