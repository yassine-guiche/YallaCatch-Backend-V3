import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiService from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Store, ArrowLeft, Send, CheckCircle2, Mail, Phone, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Public partner registration screen
 */
export default function PartnerRegister() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        contactEmail: '',
        contactPhone: '',
        category: 'food',
        website: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleCategoryChange = (value) => {
        setFormData((prev) => ({ ...prev, category: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Use direct post since service update failed for now
            await apiService.post('/auth/partner-register', formData);
            setSubmitted(true);
            toast.success('Demande d\'inscription envoyée avec succès');
        } catch (err) {
            console.error('Registration error:', err);
            toast.error(err.message || 'Une erreur est survenue lors de l\'inscription');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="w-full max-w-md border-0 shadow-lg overflow-hidden">
                    <div className="h-2 bg-green-500" />
                    <CardHeader className="text-center pt-8">
                        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                        </div>
                        <CardTitle className="text-2xl font-bold">Demande Envoyée !</CardTitle>
                        <CardDescription className="text-base mt-2">
                            Merci de votre intérêt pour YallaCatch. Votre demande est en cours d'examen.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
                            <p className="font-semibold mb-1">Prochaines étapes :</p>
                            <ul className="list-disc list-inside space-y-1 opacity-90">
                                <li>Un administrateur va examiner votre profil</li>
                                <li>Vous recevrez vos identifiants par email après validation</li>
                                <li>Le délai moyen de traitement est de 24h à 48h</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <p className="text-sm font-medium text-gray-700">Besoin d'aide ou pressé ?</p>
                            <div className="flex items-center gap-3 p-3 rounded-md border border-gray-100 bg-white">
                                <Mail className="h-4 w-4 text-primary" />
                                <div className="text-sm">
                                    <div className="text-gray-500 text-xs">Email Support</div>
                                    <div className="font-medium">admin@yallacatch.tn</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-md border border-gray-100 bg-white">
                                <Phone className="h-4 w-4 text-primary" />
                                <div className="text-sm">
                                    <div className="text-gray-500 text-xs">Téléphone / WhatsApp</div>
                                    <div className="font-medium">+216 22 222 222</div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full" onClick={() => navigate('/partner/login')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour à la connexion
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 py-12">
            <Card className="w-full max-w-lg border-0 shadow-xl overflow-hidden">
                <div className="h-2 bg-primary" />
                <CardHeader className="space-y-1">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="bg-primary p-2 rounded-lg">
                                <Store className="h-6 w-6 text-white" />
                            </div>
                            <span className="text-xl font-bold tracking-tight">YallaCatch!</span>
                        </div>
                        <Link
                            to="/partner/login"
                            className="text-sm font-medium text-primary hover:underline flex items-center"
                        >
                            <ArrowLeft className="h-3 w-3 mr-1" />
                            Connexion
                        </Link>
                    </div>
                    <CardTitle className="text-2xl font-bold">Devenir Partenaire</CardTitle>
                    <CardDescription>
                        Rejoignez notre réseau et boostez votre activité grâce à la gamification.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nom du commerce</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    placeholder="Ex: Pizzeria Bella"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Catégorie</Label>
                                <Select value={formData.category} onValueChange={handleCategoryChange}>
                                    <SelectTrigger id="category">
                                        <SelectValue placeholder="Sélectionner" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="food">Restauration</SelectItem>
                                        <SelectItem value="shopping">Shopping</SelectItem>
                                        <SelectItem value="entertainment">Divertissement</SelectItem>
                                        <SelectItem value="health">Santé</SelectItem>
                                        <SelectItem value="services">Services</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description (Optionnel)</Label>
                            <Textarea
                                id="description"
                                name="description"
                                placeholder="Décrivez brièvement votre activité..."
                                className="resize-none"
                                rows={3}
                                value={formData.description}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="contactEmail">Email de contact</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="contactEmail"
                                        name="contactEmail"
                                        type="email"
                                        placeholder="email@exemple.com"
                                        className="pl-10"
                                        required
                                        value={formData.contactEmail}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="contactPhone">Téléphone</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="contactPhone"
                                        name="contactPhone"
                                        placeholder="+216 -- --- ---"
                                        className="pl-10"
                                        required
                                        value={formData.contactPhone}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="website">Site web / Réseaux sociaux (Optionnel)</Label>
                            <div className="relative">
                                <ExternalLink className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    id="website"
                                    name="website"
                                    placeholder="https://..."
                                    className="pl-10"
                                    value={formData.website}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className="pt-4 text-xs text-gray-500 text-center italic">
                            * Votre demande sera examinée par notre équipe. Aucun paiement n'est requis à cette étape.
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full py-6 text-lg" disabled={loading}>
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Envoi...
                                </>
                            ) : (
                                <>
                                    <Send className="h-5 w-5 mr-2" />
                                    Envoyer ma demande
                                </>
                            )}
                        </Button>
                        <p className="text-center text-sm text-gray-500">
                            En envoyant cette demande, vous acceptez nos <Link to="#" className="text-primary hover:underline">Conditions Générales</Link>.
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
