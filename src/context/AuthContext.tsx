import React, { createContext, useContext, useEffect, useState } from 'react';
import type { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pocketbase';

export type UserRole = 'admin' | 'empties_manager' | 'operations_manager' | 'sales_manager' | 'cashier' | 'auditor';

export interface Profile {
    id: string;
    full_name: string | null;
    role: UserRole;
    created_at?: string;
}

interface AuthContextType {
    user: RecordModel | null;
    profile: Profile | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<RecordModel | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        let authInitialized = false;

        const sync = (model: RecordModel | null) => {
            if (!isMounted) return;
            setUser(model ?? null);
            if (model) {
                setProfile({
                    id: model.id,
                    full_name: model.name ?? null,
                    role: (model.role as UserRole) ?? 'cashier',
                    created_at: model.created,
                });
            } else {
                setProfile(null);
            }
            if (!authInitialized) {
                authInitialized = true;
                setLoading(false);
            }
        };

        sync(pb.authStore.model);

        const unsubscribe = pb.authStore.onChange((_token, model) => {
            sync(model);
        });

        // Absolute safety timeout (10s)
        const safetyTimeout = setTimeout(() => {
            if (isMounted && !authInitialized) {
                console.warn('[Auth] SAFETY TIMEOUT REACHED. Forcing loading to false.');
                setLoading(false);
                authInitialized = true;
            }
        }, 10000);

        return () => {
            isMounted = false;
            unsubscribe();
            clearTimeout(safetyTimeout);
        };
    }, []);

    const signOut = async () => {
        pb.authStore.clear();
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};