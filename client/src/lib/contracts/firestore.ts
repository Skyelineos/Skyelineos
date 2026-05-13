import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, ContractType } from './types';

export const contractsCol = collection(db, 'contracts');

export function listenAllContracts(cb: (rows: Contract[]) => void) {
  const q = query(contractsCol, orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
}

export function listenContractsByProject(projectId: string, cb: (rows: Contract[]) => void) {
  const q = query(contractsCol, where('projectId', '==', projectId));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
}

export function listenContractsForOtherUid(uid: string, cb: (rows: Contract[]) => void) {
  const q = query(contractsCol, where('other.userId', '==', uid));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
}

export async function createContract(input: Omit<Contract, 'id' | 'createdAt'> & { createdBy: string }) {
  const ref = await addDoc(contractsCol, {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
  return ref.id;
}

export async function updateContract(id: string, patch: Partial<Contract>) {
  await updateDoc(doc(db, 'contracts', id), {
    ...patch,
    updatedAt: serverTimestamp(),
  } as any);
}

export async function deleteContract(id: string) {
  await deleteDoc(doc(db, 'contracts', id));
}

export async function fetchContractsByType(type: ContractType): Promise<Contract[]> {
  const q = query(contractsCol, where('type', '==', type));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}
