import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
    Save, Loader2, Store, Phone, Mail, Globe, Facebook, Instagram, Linkedin, Twitter,
    MapPin, Plus, Navigation, Edit, Trash2, CheckCircle, XCircle
} from 'lucide-react';
import { ScrollArea } from '../components/ui/scroll-area';
import ImageUpload from '../components/ui/ImageUpload';
import partnerService from '../services/redemptions-partner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const partnerIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Map Helper Components
function MapCenterHandler({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center) map.setView(center, 13);
    }, [center, map]);
    return null;
}

export default function PartnerProfile() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [logoPreview, setLogoPreview] = useState(null);
    const [activeTab, setActiveTab] = useState('details');

    // Location State
    const [locations, setLocations] = useState([]);
    const [showLocationDialog, setShowLocationDialog] = useState(false);
    const [locationSaving, setLocationSaving] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [locationForm, setLocationForm] = useState({
        locationId: '',
        name: '',
        address: '',
        city: '',
        lat: 33.5731, // Default Casablanca
        lng: -7.5898,
        phone: '',
        isActive: true,
    });

    const { register, handleSubmit, setValue, formState: { errors } } = useForm();

    useEffect(() => {
        loadProfile();
        loadLocations();
        // Get user geolocation
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
                (err) => console.log('Geolocation error:', err)
            );
        }
    }, []);

    const loadProfile = async () => {
        try {
            setLoading(true);
            const data = await partnerService.getPartnerProfile();
            if (data) {
                setValue('name', data.name);
                setValue('description', data.description);
                setValue('website', data.website);
                setValue('contactPhone', data.contactPhone);
                setValue('contactEmail', data.contactEmail);
                if (data.socialMedia) {
                    setValue('facebook', data.socialMedia.facebook);
                    setValue('instagram', data.socialMedia.instagram);
                    setValue('linkedin', data.socialMedia.linkedin);
                    setValue('twitter', data.socialMedia.twitter);
                }
                if (data.logo) {
                    const logoUrl = data.logo.startsWith('http') ? data.logo : `${import.meta.env.VITE_API_URL?.replace('/api/v1', '')}${data.logo}`;
                    setLogoPreview(logoUrl);
                    setValue('logo', data.logo);
                }
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
            toast.error('Erreur lors du chargement du profil');
        } finally {
            setLoading(false);
        }
    };

    const loadLocations = async () => {
        try {
            const data = await partnerService.getMyPartnerLocations();
            setLocations(data || []);
        } catch (err) {
            console.error('Failed to load locations:', err);
        }
    };

    const onSubmit = async (data) => {
        try {
            setSaving(true);
            const payload = {
                name: data.name,
                description: data.description,
                website: data.website,
                contactPhone: data.contactPhone,
                contactEmail: data.contactEmail,
                logo: data.logo,
                socialMedia: {
                    facebook: data.facebook,
                    instagram: data.instagram,
                    linkedin: data.linkedin,
                    twitter: data.twitter
                }
            };
            await partnerService.updatePartnerProfile(payload);
            toast.success('Profil mis à jour avec succès');
        } catch (error) {
            console.error('Update error:', error);
            toast.error('Erreur lors de la mise à jour');
        } finally {
            setSaving(false);
        }
    };

    // Location Handlers
    const handleAddLocation = () => {
        setLocationForm({
            locationId: '',
            name: '',
            address: '',
            city: '',
            lat: userLocation ? userLocation[0] : 33.5731,
            lng: userLocation ? userLocation[1] : -7.5898,
            phone: '',
            isActive: true,
        });
        setShowLocationDialog(true);
    };

    const handleEditLocation = (loc) => {
        setLocationForm({
            locationId: loc._id,
            name: loc.name,
            address: loc.address,
            city: loc.city,
            lat: loc.coordinates?.[1] || 33.5731,
            lng: loc.coordinates?.[0] || -7.5898,
            phone: loc.phone || '',
            isActive: loc.isActive !== false,
        });
        setShowLocationDialog(true);
    };

    const reverseGeocode = async (lat, lng) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            const addr = data.address || {};
            setLocationForm(prev => ({
                ...prev,
                address: addr.road || addr.pedestrian || prev.address,
                city: addr.city || addr.town || addr.village || prev.city
            }));
        } catch (err) {
            console.log('Reverse geocode failed', err);
        }
    };

    const handleSaveLocation = async (e) => {
        e.preventDefault();
        try {
            setLocationSaving(true);
            await partnerService.updatePartnerLocation({
                ...locationForm,
                lat: parseFloat(locationForm.lat),
                lng: parseFloat(locationForm.lng),
            });
            toast.success('Emplacement sauvegardé');
            setShowLocationDialog(false);
            loadLocations();
        } catch (err) {
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setLocationSaving(false);
        }
    };

    const handleDeleteLocation = async (loc) => {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet emplacement ?')) return;

        try {
            setLocationSaving(true);
            await partnerService.deletePartnerLocation(loc._id);
            toast.success('Emplacement supprimé');
            loadLocations();
        } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la suppression');
        } finally {
            setLocationSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
            <div className="flex items-center justify-between shrink-0 px-1">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Mon Profil Entreprise</h1>
                    <p className="text-slate-500">Gérez votre identité et vos emplacements</p>
                </div>
                {activeTab === 'details' && (
                    <button
                        onClick={handleSubmit(onSubmit)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Enregistrer
                    </button>
                )}
                {activeTab === 'locations' && (
                    <Button onClick={handleAddLocation}>
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter un point
                    </Button>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px] mb-4">
                    <TabsTrigger value="details">Détails & Contact</TabsTrigger>
                    <TabsTrigger value="locations">Emplacements ({locations.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="flex-1 overflow-hidden data-[state=inactive]:hidden">
                    <ScrollArea className="h-full pr-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-20">
                            {/* Logo Section */}
                            <div className="md:col-span-1 space-y-6">
                                <Card>
                                    <CardContent className="pt-6">
                                        <h3 className="font-semibold text-slate-800 mb-4">Logo</h3>
                                        <div className="space-y-4">
                                            <ImageUpload
                                                initialPreview={logoPreview}
                                                onUploadComplete={(url) => {
                                                    setValue('logo', url); // url from service is relative path
                                                    const fullUrl = url.startsWith('http') ? url : `${import.meta.env.VITE_API_URL?.replace('/api/v1', '')}${url}`;
                                                    setLogoPreview(fullUrl);
                                                }}
                                                uploadType="partner-logo"
                                                className="aspect-square w-full"
                                            />
                                            <p className="text-xs text-slate-500 text-center">
                                                Format carré recommandé (JPG, PNG). Max 5MB.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Forms Section */}
                            <div className="md:col-span-2 space-y-6">
                                {/* General Info */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Store className="w-4 h-4 text-amber-500" />
                                            Informations Générales
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div>
                                            <label className="text-sm font-medium mb-1 block">Nom de l'entreprise</label>
                                            <Input {...register('name', { required: 'Requis' })} placeholder="Nom commercial" />
                                            {errors.name && <span className="text-red-500 text-xs">{errors.name.message}</span>}
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-1 block">Description</label>
                                            <textarea
                                                {...register('description')}
                                                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                placeholder="Description de votre activité..."
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-1 block">Site Web</label>
                                            <div className="relative">
                                                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input {...register('website')} className="pl-9" placeholder="https://..." />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Contact */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Phone className="w-4 h-4 text-amber-500" />
                                            Contact & Réseaux
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-sm font-medium mb-1 block">Téléphone</label>
                                                <div className="relative">
                                                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input {...register('contactPhone')} className="pl-9" placeholder="+212..." />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium mb-1 block">Email Public</label>
                                                <div className="relative">
                                                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input {...register('contactEmail')} className="pl-9" placeholder="contact@..." />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                            <div className="relative">
                                                <Facebook className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input {...register('facebook')} className="pl-9" placeholder="Facebook URL" />
                                            </div>
                                            <div className="relative">
                                                <Instagram className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input {...register('instagram')} className="pl-9" placeholder="Instagram URL" />
                                            </div>
                                            <div className="relative">
                                                <Linkedin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input {...register('linkedin')} className="pl-9" placeholder="LinkedIn URL" />
                                            </div>
                                            <div className="relative">
                                                <Twitter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input {...register('twitter')} className="pl-9" placeholder="Twitter URL" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </ScrollArea>
                </TabsContent>

                <TabsContent value="locations" className="flex-1 overflow-hidden data-[state=inactive]:hidden">
                    <ScrollArea className="h-full pr-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
                            {/* List of Locations */}
                            <div className="space-y-4">
                                {locations.map((loc) => (
                                    <Card key={loc._id} className="relative overflow-hidden group hover:border-amber-300 transition-colors">
                                        <CardContent className="p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-4 w-4 text-amber-500" />
                                                    <h4 className="font-semibold text-slate-800">{loc.name}</h4>
                                                </div>
                                                <Badge variant={loc.isActive ? 'outline' : 'secondary'} className={loc.isActive ? 'text-green-600 bg-green-50' : ''}>
                                                    {loc.isActive ? 'Actif' : 'Inactif'}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-slate-600 mb-1">{loc.address}</p>
                                            <p className="text-xs text-slate-500 mb-3">{loc.city}</p>

                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" className="h-8" onClick={() => handleEditLocation(loc)}>
                                                    <Edit className="h-3.5 w-3.5 mr-1" /> Modifier
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => handleDeleteLocation(loc)}>
                                                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                                {locations.length === 0 && (
                                    <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                        <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                                        <p className="text-slate-500">Aucun emplacement défini</p>
                                        <Button variant="link" onClick={handleAddLocation}>Ajouter le premier</Button>
                                    </div>
                                )}
                            </div>

                            {/* Preview Map */}
                            <div className="h-[400px] lg:h-[calc(100vh-250px)] rounded-xl overflow-hidden border border-slate-200">
                                <MapContainer center={[33.5731, -7.5898]} zoom={6} style={{ height: '100%', width: '100%' }}>
                                    <TileLayer
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    />
                                    {locations.map((loc, idx) => (
                                        loc.coordinates && (
                                            <Marker key={idx} position={[loc.coordinates[1], loc.coordinates[0]]} icon={partnerIcon}>
                                                <Popup>
                                                    <strong>{loc.name}</strong><br />{loc.address}
                                                </Popup>
                                            </Marker>
                                        )
                                    ))}
                                    {userLocation && (
                                        <Marker position={userLocation}>
                                            <Popup>Vous êtes ici</Popup>
                                        </Marker>
                                    )}
                                </MapContainer>
                            </div>
                        </div>
                    </ScrollArea>
                </TabsContent>
            </Tabs>

            {/* Location Dialog */}
            <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 shrink-0">
                        <DialogTitle>{locationForm.locationId ? 'Modifier l\'emplacement' : 'Nouvel emplacement'}</DialogTitle>
                        <DialogDescription>Cliquez sur la carte pour positionner le point de vente.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 pt-2">
                        <form id="location-form" onSubmit={handleSaveLocation} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Nom</label>
                                        <Input
                                            value={locationForm.name}
                                            onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                                            placeholder="Ex: Siège Social"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Adresse</label>
                                        <Input
                                            value={locationForm.address}
                                            onChange={e => setLocationForm({ ...locationForm, address: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Ville</label>
                                        <Input
                                            value={locationForm.city}
                                            onChange={e => setLocationForm({ ...locationForm, city: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Téléphone (opt)</label>
                                        <Input
                                            value={locationForm.phone}
                                            onChange={e => setLocationForm({ ...locationForm, phone: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs font-medium mb-1 block text-slate-500">Latitude</label>
                                            <Input
                                                value={locationForm.lat}
                                                onChange={e => setLocationForm({ ...locationForm, lat: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium mb-1 block text-slate-500">Longitude</label>
                                            <Input
                                                value={locationForm.lng}
                                                onChange={e => setLocationForm({ ...locationForm, lng: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 pt-2">
                                        <input
                                            type="checkbox"
                                            id="isActive"
                                            checked={locationForm.isActive}
                                            onChange={e => setLocationForm({ ...locationForm, isActive: e.target.checked })}
                                            className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                                        />
                                        <label htmlFor="isActive" className="text-sm text-slate-700">Emplacement actif</label>
                                    </div>
                                </div>

                                {/* Map Picker */}
                                <div className="h-[300px] md:h-auto rounded-lg overflow-hidden border border-slate-200 relative">
                                    <MapContainer
                                        center={[locationForm.lat, locationForm.lng]}
                                        zoom={13}
                                        style={{ height: '100%', width: '100%' }}
                                        whenReady={(map) => {
                                            map.target.on('click', (e) => {
                                                const { lat, lng } = e.latlng;
                                                setLocationForm(prev => ({ ...prev, lat, lng }));
                                                reverseGeocode(lat, lng);
                                            });
                                        }}
                                    >
                                        <TileLayer
                                            attribution='&copy; OpenStreetMap'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <MapCenterHandler center={[locationForm.lat, locationForm.lng]} />
                                        <Marker position={[locationForm.lat, locationForm.lng]} icon={partnerIcon}>
                                            <Popup>Emplacement sélectionné</Popup>
                                        </Marker>
                                    </MapContainer>

                                    {userLocation && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            className="absolute bottom-2 right-2 z-[400] text-xs h-7"
                                            onClick={() => {
                                                setLocationForm(prev => ({ ...prev, lat: userLocation[0], lng: userLocation[1] }));
                                                reverseGeocode(userLocation[0], userLocation[1]);
                                            }}
                                        >
                                            <Navigation className="w-3 h-3 mr-1" /> Ma position
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </form>
                    </div>

                    <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 shrink-0">
                        <Button variant="outline" onClick={() => setShowLocationDialog(false)}>Annuler</Button>
                        <Button form="location-form" type="submit" disabled={locationSaving}>
                            {locationSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            Sauvegarder
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
