import { redirect } from 'next/navigation';

export default function NewOrderRedirect() {
  redirect('/orders/new/ondemand');
}
