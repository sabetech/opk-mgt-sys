import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Users,
    UserPlus,
    MoreHorizontal,
    Shield,
    Calendar,
    Loader2,
    Search,
    Edit2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth, type UserRole, type Profile } from '@/context/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ManageUsers() {
    const { profile: currentProfile } = useAuth();
    const navigate = useNavigate();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [newRole, setNewRole] = useState<UserRole | null>(null);
    const [newName, setNewName] = useState('');
    const [updating, setUpdating] = useState(false);

    // Only allow admins
    useEffect(() => {
        if (currentProfile && currentProfile.role !== 'admin') {
            navigate('/dashboard');
        }
    }, [currentProfile, navigate]);

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProfiles(data || []);
        } catch (error: any) {
            console.error('Error fetching profiles:', error);
            toast.error(error.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfiles();
    }, []);

    const handleEditClick = (profile: Profile) => {
        setEditingProfile(profile);
        setNewRole(profile.role);
        setNewName(profile.full_name || '');
        setIsEditDialogOpen(true);
    };

    const handleUpdateProfile = async () => {
        if (!editingProfile || !newRole) return;

        setUpdating(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    role: newRole,
                    full_name: newName
                })
                .eq('id', editingProfile.id);

            if (error) throw error;

            toast.success(`User ${newName || 'profile'} updated successfully`);
            setIsEditDialogOpen(false);
            fetchProfiles();
        } catch (error: any) {
            console.error('Error updating profile:', error);
            toast.error(error.message || 'Failed to update profile');
        } finally {
            setUpdating(false);
        }
    };

    const filteredProfiles = profiles.filter(p =>
        (p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || '') ||
        (p.role.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'admin': return 'bg-red-100 text-red-800 border-red-200';
            case 'operations_manager': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'sales_manager': return 'bg-green-100 text-green-800 border-green-200';
            case 'empties_manager': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'cashier': return 'bg-purple-100 text-purple-800 border-purple-200';
            default: return 'bg-slate-100 text-slate-800 border-slate-200';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-2xl font-bold tracking-tight">Manage Users</h2>
                    <p className="text-muted-foreground">
                        View and manage employee accounts and access levels.
                    </p>
                </div>
                <Button
                    onClick={() => navigate('/dashboard/admin/add-user')}
                    className="bg-amber-900 hover:bg-amber-800 text-white shrink-0"
                >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add New User
                </Button>
            </div>

            <Card className="border-amber-900/10 shadow-sm">
                <CardHeader className="pb-3 border-b border-amber-900/5">
                    <div className="flex items-center justify-between gap-4">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <Users className="h-5 w-5 text-amber-900" />
                            User List
                        </CardTitle>
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or role..."
                                className="pl-9 bg-muted/50 focus-visible:ring-amber-500"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="border-amber-900/5 hover:bg-transparent">
                                    <TableHead className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs tracking-wider">User</TableHead>
                                    <TableHead className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Role</TableHead>
                                    <TableHead className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Joined Date</TableHead>
                                    <TableHead className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs tracking-wider text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                            Loading users...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredProfiles.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                                            No users found matching your search.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredProfiles.map((p) => (
                                        <TableRow key={p.id} className="hover:bg-muted/30 transition-colors border-amber-900/5">
                                            <TableCell className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-900 font-bold">
                                                        {p.full_name?.substring(0, 2).toUpperCase() || '??'}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-amber-950 dark:text-amber-50">
                                                            {p.full_name || 'No name'}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            ID: {p.id.substring(0, 8)}...
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(p.role)} uppercase tracking-wider`}>
                                                    <Shield className="mr-1 h-3 w-3" />
                                                    {p.role.replace('_', ' ')}
                                                </span>
                                            </TableCell>
                                            <TableCell className="px-6 py-4 text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {/* @ts-ignore created_at exists on profile */}
                                                    {p.created_at ? format(new Date(p.created_at), 'MMM dd, yyyy') : 'N/A'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-6 py-4 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => handleEditClick(p)}>
                                                            <Edit2 className="mr-2 h-4 w-4" />
                                                            Edit User
                                                        </DropdownMenuItem>
                                                        {p.id !== currentProfile?.id && (
                                                            <DropdownMenuItem className="text-red-600">
                                                                <Users className="mr-2 h-4 w-4" />
                                                                Deactivate (WIP)
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Edit User Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                        <DialogDescription>
                            Change user role or update their full name.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">Full Name</Label>
                            <Input
                                id="edit-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-role">Role</Label>
                            <Select
                                value={newRole || ''}
                                onValueChange={(value: UserRole) => setNewRole(value)}
                            >
                                <SelectTrigger id="edit-role">
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="empties_manager">Empties Manager</SelectItem>
                                    <SelectItem value="operations_manager">Operations Manager</SelectItem>
                                    <SelectItem value="sales_manager">Sales Manager</SelectItem>
                                    <SelectItem value="cashier">Cashier</SelectItem>
                                    <SelectItem value="auditor">Auditor</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleUpdateProfile}
                            disabled={updating}
                            className="bg-amber-900 hover:bg-amber-800 text-white"
                        >
                            {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
