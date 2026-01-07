import React, { useState, useEffect } from 'react'
import { Box, Text, Static, useInput } from 'ink'
import Spinner from 'ink-spinner'
import gradient from 'gradient-string'

import { Header } from '../../deploy/ui/Header.js'
import { ConfirmDialog } from '../../deploy/ui/ConfirmDialog.js'
import { GlowingBox } from '../../deploy/ui/GlowingBox.js'

const completed_gradient = gradient(['#2DD4BF', '#4DA2FF'])

const COLORS = {
  sui: '#4DA2FF',
  accent: '#00D4FF',
  success: '#2DD4BF',
  error: '#F43F5E',
  warning: '#FCD34D',
  dim: '#64748B',
}

const STEPS = {
  VALIDATING: 'validating',
  ESTIMATING_COST: 'estimating_cost',
  CONFIRM: 'confirm',
  DELETING_RESOURCES: 'deleting_resources',
  DELETING_SITES_BATCH: 'deleting_sites_batch',
  DELETING_SITE: 'deleting_site',
  DONE: 'done',
}

export default function App({
  site_ids,
  site_details,
  network,
  autoYes = false,
  onStepChange,
  onComplete,
  onError,
}) {
  const [step, setStep] = useState(STEPS.VALIDATING)
  const [completedSteps, setCompletedSteps] = useState([])
  const [spinnerText, setSpinnerText] = useState('')
  const [progressInfo, setProgressInfo] = useState('')
  const [error, setError] = useState(null)
  const [validationResult, setValidationResult] = useState(null)
  const [gasCostEstimate, setGasCostEstimate] = useState(null)
  const [currentSiteIndex, setCurrentSiteIndex] = useState(0)
  const [deletionResults, setDeletionResults] = useState([])

  // Step transition handler
  const advanceStep = (nextStep, data = {}) => {
    if (step !== nextStep) {
      const stepLog = getStepLog(step, data)
      if (stepLog) {
        setCompletedSteps(prev => [...prev, stepLog])
      }
    }
    setStep(nextStep)
  }

  // Generate log entry for completed step
  const getStepLog = (completedStep, data) => {
    switch (completedStep) {
      case STEPS.VALIDATING:
        return `✓ Validated ${data.siteCount || 0} site(s) with ${data.resourceCount || 0} resource(s)`
      case STEPS.ESTIMATING_COST:
        if (data.estimatedGas) {
          const sui_cost = (data.estimatedGas.total / 1_000_000_000).toFixed(4)
          return `✓ Gas cost: ${sui_cost} SUI (dry-run)`
        }
        return `✓ Gas check complete`
      case STEPS.DELETING_RESOURCES:
        return `✓ Deleted ${data.resourceCount || 0} resource(s)`
      case STEPS.DELETING_SITES_BATCH:
        return `✓ Deleted ${data.deletedCount || 0} site(s) in single transaction`
      case STEPS.DELETING_SITE:
        return `✓ Deleted site: ${data.siteId ? data.siteId.slice(0, 10) + '...' : 'unknown'}`
      default:
        return null
    }
  }

  // VALIDATING step
  useEffect(() => {
    if (step !== STEPS.VALIDATING || !onStepChange) return

    const executeValidation = async () => {
      try {
        setSpinnerText('Validating sites...')
        const data = await onStepChange('validating', { site_ids, network })
        setValidationResult(data)
        advanceStep(STEPS.ESTIMATING_COST, {
          siteCount: data.validated_sites?.length || 0,
          resourceCount: data.total_resources || 0,
        })
      } catch (err) {
        handleError(err)
      }
    }

    executeValidation()
  }, [step])

  // ESTIMATING_COST step
  useEffect(() => {
    if (step !== STEPS.ESTIMATING_COST || !onStepChange || !validationResult)
      return

    const executeEstimation = async () => {
      try {
        setSpinnerText('Checking gas cost (dry-run)...')
        const data = await onStepChange('estimating_cost', {
          validated_sites: validationResult.validated_sites,
          network,
        })
        setGasCostEstimate(data.estimated_gas)
        advanceStep(STEPS.CONFIRM, {
          estimatedGas: data.estimated_gas,
        })
      } catch (err) {
        // Non-critical error - proceed without cost estimate
        console.error('Gas estimation failed:', err)
        setGasCostEstimate(null)
        advanceStep(STEPS.CONFIRM, {})
      }
    }

    executeEstimation()
  }, [step, validationResult])

  // Auto-advance CONFIRM if autoYes
  useEffect(() => {
    if (step === STEPS.CONFIRM && autoYes) {
      advanceStep(STEPS.DELETING_RESOURCES)
    }
  }, [step, autoYes])

  // DELETING_RESOURCES step
  useEffect(() => {
    if (step !== STEPS.DELETING_RESOURCES || !onStepChange || !validationResult)
      return

    const executeResourceDeletion = async () => {
      try {
        const site = validationResult.validated_sites[currentSiteIndex]
        setSpinnerText(
          `[${currentSiteIndex + 1}/${validationResult.validated_sites.length}] Deleting resources...`,
        )

        const data = await onStepChange('deleting_resources', {
          site_id: site.site_id,
          admin_cap_id: site.admin_cap_id,
          resources: site.resources,
          network,
        })

        setDeletionResults(prev => [
          ...prev,
          { ...data, site_id: site.site_id },
        ])
        advanceStep(STEPS.DELETING_RESOURCES, {
          resourceCount: site.resources?.length || 0,
        })

        // Check if more sites need resource deletion
        if (currentSiteIndex + 1 < validationResult.validated_sites.length) {
          setCurrentSiteIndex(prev => prev + 1)
          // Stay in DELETING_RESOURCES to process next site
        } else {
          // All resources deleted, now batch delete all sites
          setStep(STEPS.DELETING_SITES_BATCH)
        }
      } catch (err) {
        handleError(err)
      }
    }

    executeResourceDeletion()
  }, [step, validationResult, currentSiteIndex])

  // DELETING_SITES_BATCH step (all sites at once)
  useEffect(() => {
    if (
      step !== STEPS.DELETING_SITES_BATCH ||
      !onStepChange ||
      !validationResult
    )
      return

    const executeBatchSiteDeletion = async () => {
      try {
        setSpinnerText(
          `Deleting ${validationResult.validated_sites.length} site(s) in single transaction...`,
        )

        const data = await onStepChange('deleting_sites_batch', {
          validated_sites: validationResult.validated_sites,
          network,
        })

        advanceStep(STEPS.DELETING_SITES_BATCH, {
          deletedCount: data.deleted_count,
        })

        // All done
        handleComplete({
          deleted_count: data.deleted_count,
          results: deletionResults,
        })
      } catch (err) {
        handleError(err)
      }
    }

    executeBatchSiteDeletion()
  }, [step, validationResult])

  const handleConfirm = confirmed => {
    if (!confirmed) {
      if (onError) {
        onError(new Error('User cancelled deletion'))
      }
      return
    }
    advanceStep(STEPS.DELETING_RESOURCES)
  }

  const handleComplete = finalResult => {
    advanceStep(STEPS.DONE)
    if (onComplete) {
      onComplete(finalResult)
    }
  }

  const handleError = err => {
    setError(err.message)
    if (onError) {
      onError(err)
    }
  }

  // Render current step
  const renderCurrentStep = () => {
    const needs_top_margin = completedSteps.length === 0
    return React.createElement(
      Box,
      { flexDirection: 'column', marginTop: needs_top_margin ? 2 : 0 },
      error &&
        React.createElement(
          Box,
          { marginBottom: 1 },
          React.createElement(Text, { color: COLORS.error }, '✗ ', error),
        ),
      step === STEPS.VALIDATING &&
        React.createElement(
          GlowingBox,
          { color: COLORS.sui },
          React.createElement(
            Text,
            { color: COLORS.sui },
            React.createElement(Spinner, { type: 'dots' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.ESTIMATING_COST &&
        React.createElement(
          GlowingBox,
          { color: COLORS.accent },
          React.createElement(
            Text,
            { color: COLORS.accent },
            React.createElement(Spinner, { type: 'dots' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.CONFIRM &&
        !autoYes &&
        validationResult &&
        React.createElement(ConfirmDialog, {
          title: 'Delete site(s)?',
          details: [
            `Network: ${network}`,
            `Sites to delete: ${validationResult.validated_sites?.length || 0}`,
            `Total resources: ${validationResult.total_resources || 0}`,
            gasCostEstimate
              ? `Gas cost: ${(gasCostEstimate.total / 1_000_000_000).toFixed(4)} SUI (dry-run)`
              : '',
            gasCostEstimate
              ? `  Computation: ${(gasCostEstimate.computation / 1_000_000_000).toFixed(6)} SUI`
              : '',
            gasCostEstimate
              ? `  Storage rebate: ~${(gasCostEstimate.rebate / 1_000_000_000).toFixed(6)} SUI`
              : '',
            '',
            ...validationResult.validated_sites.map(
              s =>
                `  ${s.site_id.slice(0, 10)}... (${s.resources?.length || 0} resources)`,
            ),
            '',
            '⚠️  This action CANNOT be undone!',
          ].filter(Boolean),
          isFree: false,
          onConfirm: () => handleConfirm(true),
          onCancel: () => handleConfirm(false),
        }),
      step === STEPS.DELETING_RESOURCES &&
        React.createElement(
          GlowingBox,
          { color: COLORS.warning },
          React.createElement(
            Text,
            { color: COLORS.warning },
            React.createElement(Spinner, { type: 'line' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.DELETING_SITES_BATCH &&
        React.createElement(
          GlowingBox,
          { color: COLORS.success },
          React.createElement(
            Text,
            { color: COLORS.success },
            React.createElement(Spinner, { type: 'arc' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.DELETING_SITE &&
        React.createElement(
          GlowingBox,
          { color: COLORS.error },
          React.createElement(
            Text,
            { color: COLORS.error },
            React.createElement(Spinner, { type: 'bouncingBar' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.DONE &&
        React.createElement(
          Box,
          { flexDirection: 'column', marginTop: 1 },
          React.createElement(
            Text,
            { color: COLORS.success, bold: true },
            '✓ Deletion complete!',
          ),
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { dimColor: true },
              `Deleted ${validationResult?.validated_sites?.length || 0} site(s)`,
            ),
          ),
        ),
    )
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },

    // 1. Header (Static)
    React.createElement(Static, { items: [{ id: 'header' }] }, item =>
      React.createElement(Header, { key: item.id }),
    ),

    // 2. Completed steps
    completedSteps.length > 0 &&
      React.createElement(
        Box,
        { flexDirection: 'column', marginTop: 1 },
        completedSteps.map((log, idx) =>
          React.createElement(Text, { key: idx }, completed_gradient(log)),
        ),
      ),

    // 3. Current step content
    renderCurrentStep(),

    // 4. Separator (only if not DONE)
    step !== STEPS.DONE &&
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(Text, { color: COLORS.dim }, '━'.repeat(55)),
      ),

    // 5. Progress indicator (only if deleting resources)
    step !== STEPS.DONE &&
      validationResult &&
      step === STEPS.DELETING_RESOURCES &&
      React.createElement(
        Box,
        { marginTop: 1, paddingLeft: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          `Progress: ${currentSiteIndex + 1}/${validationResult.validated_sites.length} sites (resources)`,
        ),
      ),
  )
}
