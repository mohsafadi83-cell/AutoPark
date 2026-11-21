import {
  CheckCircle as DoneIcon,
  Error as FailedIcon,
  RadioButtonChecked as ActiveIcon,
  RadioButtonUnchecked as PendingIcon,
} from '@mui/icons-material';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PARK_STEPS,
  RETRIEVE_STEPS,
  type ParkingRequest,
  type RequestStep,
  type StepStatus,
} from '../types/api';

/**
 * Safety invariant:
 * Always returns all 7 ordered steps for PARK or RETRIEVE.
 * The final step (PARKING_COMPLETED / VEHICLE_READY) is NEVER allowed to be 'DONE'
 * unless `request.status === 'COMPLETED'`.
 */
export function normalizeRequestSteps(
  request: Pick<ParkingRequest, 'requestType' | 'status' | 'steps'>,
): RequestStep[] {
  const templateKeys = request.requestType === 'PARK' ? PARK_STEPS : RETRIEVE_STEPS;
  const byKey = new Map<string, RequestStep>();
  for (const s of request.steps ?? []) {
    byKey.set(s.key, s);
  }

  return templateKeys.map((key, idx) => {
    const existing = byKey.get(key);
    const isFinalStep = idx === templateKeys.length - 1;
    let status: StepStatus = existing?.status ?? 'PENDING';
    let at: string | null = existing?.at ?? null;

    if (isFinalStep && status === 'DONE' && request.status !== 'COMPLETED') {
      status = request.status === 'IN_PROGRESS' || request.status === 'PROCESSING' ? 'ACTIVE' : 'PENDING';
      at = null;
    }

    return { key, status, at };
  });
}

export const RequestTimeline: React.FC<{ request: ParkingRequest }> = ({ request }) => {
  const { t } = useTranslation();
  const steps = normalizeRequestSteps(request);

  const iconFor = (status: StepStatus) => {
    switch (status) {
      case 'DONE':
        return <DoneIcon color="success" fontSize="small" />;
      case 'ACTIVE':
        return <ActiveIcon color="primary" fontSize="small" />;
      case 'FAILED':
        return <FailedIcon color="error" fontSize="small" />;
      default:
        return <PendingIcon color="disabled" fontSize="small" />;
    }
  };

  return (
    <Box>
      {request.status !== 'COMPLETED' && request.status !== 'FAILED' && request.status !== 'CANCELLED' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('requests.notCompletedYet')}
        </Alert>
      )}
      <Stack spacing={1.5}>
        {steps.map((step, index) => (
          <Stack
            key={step.key}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            data-testid={`timeline-step-${step.key}`}
            data-status={step.status}
            sx={{
              p: 1.25,
              borderRadius: 1,
              border: '1px solid',
              borderColor: step.status === 'ACTIVE' ? 'primary.main' : 'divider',
              bgcolor: step.status === 'ACTIVE' ? 'action.selected' : 'transparent',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              {iconFor(step.status)}
              <Box>
                <Typography variant="body2" fontWeight={step.status === 'ACTIVE' || step.status === 'DONE' ? 700 : 500}>
                  {index + 1}. {t(`steps.${step.key}`)}
                </Typography>
                {step.at && (
                  <Typography variant="caption" color="text.secondary">
                    {new Date(step.at).toLocaleTimeString()}
                  </Typography>
                )}
              </Box>
            </Stack>
            <Chip
              size="small"
              label={t(`stepStatus.${step.status}`)}
              color={
                step.status === 'DONE'
                  ? 'success'
                  : step.status === 'ACTIVE'
                    ? 'primary'
                    : step.status === 'FAILED'
                      ? 'error'
                      : 'default'
              }
              variant={step.status === 'PENDING' ? 'outlined' : 'filled'}
            />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
};
