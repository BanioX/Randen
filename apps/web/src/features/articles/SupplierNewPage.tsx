import { useNavigate } from 'react-router';
import { paths } from '../../app/paths';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/Toast';
import { articlesMessages } from './messages';
import { SupplierForm } from './SupplierForm';

const t = articlesMessages.suppliers;

/** «Lieferant erfassen»: a name is enough, the rest can follow. */
export function SupplierNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <>
      <PageHeader title={t.form.createTitle} back={{ to: paths.suppliers(), label: t.back }} />
      <SupplierForm
        placement="page"
        onSaved={(supplierId) => {
          toast({ text: t.form.saved, tone: 'ok' });
          void navigate(paths.supplier(supplierId), { replace: true });
        }}
        onCancel={() => {
          void navigate(paths.suppliers());
        }}
      />
    </>
  );
}
