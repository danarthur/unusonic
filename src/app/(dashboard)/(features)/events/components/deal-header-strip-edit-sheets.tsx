'use client';

/**
 * Trailing portal sheets for the deal header strip — the contact picker
 * (when adding a company as bill-to), NetworkDetailSheet (legacy edit
 * entrypoint, kept for context-menu callers), and the couple/individual
 * edit sheets. Co-located so the parent JSX stays focused on the strip
 * itself.
 */

import { NetworkDetailSheet } from '@/widgets/network-detail';
import type { NetworkSearchOrg, NodeDetail } from '@/features/network-data';
import type {
  CoupleEntityForEdit,
  IndividualEntityForEdit,
} from '../actions/get-node-for-sheet';
import type { OrgRosterContact } from '../actions/deal-stakeholders';
import { ClientContactPickerSheet } from './deal-header-strip-client-sheet';
import { CoupleEditSheet } from './couple-edit-sheet';
import { IndividualEditSheet } from './individual-edit-sheet';

export type DealHeaderEditSheetsProps = {
  /** Bill-to contact picker */
  contactSheetOpen: boolean;
  onContactSheetOpenChange: (open: boolean) => void;
  pendingClientOrg: NetworkSearchOrg | null;
  roster: OrgRosterContact[];
  rosterLoading: boolean;
  adding: boolean;
  onConfirmBillTo: (org: NetworkSearchOrg, entityId: string | null) => void;

  /** NetworkDetailSheet — legacy edit entrypoint */
  sheetDetails: NodeDetail | null;
  sourceOrgId: string | null;
  crmReturnPath: string;
  onSheetClose: () => void;

  /** Couple / individual edit sheets */
  coupleEdit: { open: boolean; entityId: string; initialValues: CoupleEntityForEdit } | null;
  onCoupleEditClose: () => void;
  individualEdit: { open: boolean; entityId: string; initialValues: IndividualEntityForEdit } | null;
  onIndividualEditClose: () => void;
  onStakeholdersChange: () => void;
};

export function DealHeaderEditSheets({
  contactSheetOpen,
  onContactSheetOpenChange,
  pendingClientOrg,
  roster,
  rosterLoading,
  adding,
  onConfirmBillTo,
  sheetDetails,
  sourceOrgId,
  crmReturnPath,
  onSheetClose,
  coupleEdit,
  onCoupleEditClose,
  individualEdit,
  onIndividualEditClose,
  onStakeholdersChange,
}: DealHeaderEditSheetsProps) {
  return (
    <>
      {/* Contact picker sheet (company bill_to) */}
      <ClientContactPickerSheet
        open={contactSheetOpen}
        onOpenChange={onContactSheetOpenChange}
        pendingClientOrg={pendingClientOrg}
        roster={roster}
        rosterLoading={rosterLoading}
        adding={adding}
        onConfirm={onConfirmBillTo}
      />

      {/* NetworkDetailSheet */}
      {sheetDetails && sourceOrgId && (
        <NetworkDetailSheet
          details={sheetDetails}
          sourceOrgId={sourceOrgId}
          onClose={onSheetClose}
          returnPath={crmReturnPath}
        />
      )}

      {/* CoupleEditSheet */}
      {coupleEdit && (
        <CoupleEditSheet
          open={coupleEdit.open}
          onOpenChange={(v) => !v && onCoupleEditClose()}
          entityId={coupleEdit.entityId}
          initialValues={coupleEdit.initialValues}
          onSaved={() => {
            onCoupleEditClose();
            onStakeholdersChange();
          }}
        />
      )}

      {/* IndividualEditSheet */}
      {individualEdit && (
        <IndividualEditSheet
          open={individualEdit.open}
          onOpenChange={(v) => !v && onIndividualEditClose()}
          entityId={individualEdit.entityId}
          initialValues={individualEdit.initialValues}
          onSaved={() => {
            onIndividualEditClose();
            onStakeholdersChange();
          }}
        />
      )}
    </>
  );
}
