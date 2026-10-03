import { redirect } from 'next/navigation';

/**
 * The public company landing page is served by bawain.my.id.
 * The customer application host must enter through its authenticated portal.
 */
export default function CustomerRootRedirect() {
  redirect('/login');
}
