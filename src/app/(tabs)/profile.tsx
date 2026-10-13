import { ProfileView } from '../../components/ProfileView';
import { useAuth } from '../../lib/auth';

export default function MyProfile() {
  const { session } = useAuth();
  return <ProfileView userId={session!.user.id} />;
}
