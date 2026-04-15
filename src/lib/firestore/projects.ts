import {
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Project } from '@/types';
import { stripUndefined } from './strip-undefined';

const projectsRef = (uid: string) =>
    collection(db, 'users', uid, 'projects');

const projectRef = (uid: string, projectId: string) =>
    doc(db, 'users', uid, 'projects', projectId);

export async function saveProject(uid: string, project: Project): Promise<void> {
    await setDoc(projectRef(uid, project.id), stripUndefined({
        ...project,
        _updatedAt: serverTimestamp(),
    }));
}

export async function loadProjects(uid: string): Promise<Project[]> {
    const snap = await getDocs(projectsRef(uid));
    return snap.docs.map((d) => {
        const data = d.data();
        // Strip Firestore-only fields before returning typed Project
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _updatedAt, ...project } = data;
        return project as Project;
    });
}

export async function deleteProject(uid: string, projectId: string): Promise<void> {
    await deleteDoc(projectRef(uid, projectId));
}
