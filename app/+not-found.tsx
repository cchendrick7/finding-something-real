import { Link } from 'expo-router';
import { Screen, Display, Body, Rule } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen>
      <Display>Nothing here</Display>
      <Rule />
      <Body>That page does not exist.</Body>
      <Link href="/" style={{ marginTop: 20 }}>
        <Body style={{ textDecorationLine: 'underline' }}>Back to the start</Body>
      </Link>
    </Screen>
  );
}
