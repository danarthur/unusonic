import { createClient } from '@/shared/api/supabase/server';

export async function getDashboardFinances() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .schema('finance')
      .from('invoices')
      .select('*')
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching finances:', error);
      return [];
    }

    return data;
  } catch (error) {
    console.error('Error initializing finance client:', error);
    return [];
  }
}