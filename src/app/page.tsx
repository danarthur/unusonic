import { redirect } from 'next/navigation';

/**
 * Root page: never renders for authenticated users (middleware intercepts /).
 * If we reach here, the user is not authenticated → send to login.
 */
export default function RootPage() {
  redirect('/login');
}
