import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type UserRole = 'admin' | 'empties_manager' | 'operations_manager' | 'sales_manager' | 'cashier' | 'auditor';

export interface Profile {
    id: string;
    full_name: string | null;
    role: UserRole;
}

interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId: string) => {
        console.log(`[Auth] Fetching profile for: ${userId}`);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    console.warn('[Auth] Profile not found in database (PGRST116)');
                } else {
                    console.error('[Auth] Database error fetching profile:', error);
                }
                setProfile(null);
                return;
            }

            console.log('[Auth] Profile fetched successfully:', data);
            setProfile(data);
        } catch (error) {
            console.error('[Auth] Unexpected error fetching profile:', error);
            setProfile(null);
        }
    };

    useEffect(() => {
        let isMounted = true;
        let authInitialized = false;

        const handleAuthStateChange = async (session: any, source: string) => {
            const currentUser = session?.user ?? null;
            console.log(`[Auth] Handling state change (${source}). User: ${currentUser?.email || 'none'}`);

            if (isMounted) {
                setUser(currentUser);
                if (currentUser) {
                    await fetchProfile(currentUser.id);
                } else {
                    setProfile(null);
                }

                if (!authInitialized) {
                    authInitialized = true;
                    setLoading(false);
                    console.log("[Auth] Initial loading cleared");
                }
            }
        };

        // 1. Initial manual check
        console.log("[Auth] Starting initial session check...");
        supabase.auth.getSession().then(({ data: { session }, error }) => {
            if (error) {
                console.error("[Auth] Initial session check error:", error);
                if (isMounted && !authInitialized) {
                    authInitialized = true;
                    setLoading(false);
                }
            } else {
                handleAuthStateChange(session, "initial_check");
            }
        }).catch(err => {
            console.error("[Auth] Initial session check promise rejected:", err);
            if (isMounted && !authInitialized) {
                authInitialized = true;
                setLoading(false);
            }
        });

        // 2. Auth state change listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("[Auth] Event fired:", event);
            // supabase-js often fires initial session here too
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
                handleAuthStateChange(session, event);
            } else if (!authInitialized) {
                // For any other event, if we haven't initialized, do it now
                setLoading(false);
                authInitialized = true;
            }
        });

        // 3. Absolute safety timeout (10s)
        const safetyTimeout = setTimeout(() => {
            if (isMounted && !authInitialized) {
                console.warn("[Auth] SAFETY TIMEOUT REACHED. Forcing loading to false.");
                setLoading(false);
                authInitialized = true;
            }
        }, 10000);

        return () => {
            isMounted = false;
            subscription.unsubscribe();
            clearTimeout(safetyTimeout);
        };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
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
