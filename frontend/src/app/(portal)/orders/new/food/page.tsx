import { redirect } from 'next/navigation';

export default function DisabledCustomerFoodRoute() {
  redirect('/orders/new/ondemand');
}
