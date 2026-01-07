import React, { useState, useEffect } from 'react'
import { Box, Text, Static, useInput } from 'ink'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import gradient from 'gradient-string'

import { Header } from '../../../ui/Header.js'
import { SiteSelector } from '../../../ui/SiteSelector.js'
import { ProgressSpinner } from '../../../ui/ProgressSpinner.js'

const completed_gradient = gradient(['#2DD4BF', '#4DA2FF'])

const COLORS = {
  sui: '#4DA2FF',
  accent: '#00D4FF',
  success: '#2DD4BF',
  error: '#F43F5E',
  dim: '#64748B',
  warning: '#F59E0B',
}

const STEPS = {
  SELECT_SITE: 'select_site',
  VALIDATING: 'validating',
  ESTIMATING_COST: 'estimating_cost',
  CONFIRM: 'confirm',
  EXECUTING: 'executing',
  DONE: 'done',
}

export default function App({
  domain,
  site_id = null,
  sites = [],
  is_loading_sites = false,
  onSiteSelect,
  onValidateDomain,
  onEstimateCost,
  onExecute,
  onComplete,
  onError,
}) {
  const [step, setStep] = useState(
    site_id ? STEPS.VALIDATING : STEPS.SELECT_SITE,
  )
  const [selected_site, setSelectedSite] = useState(null)
  const [validation_result, setValidationResult] = useState(null)
  const [gas_cost_estimate, setGasCostEstimate] = useState(null)
  const [completedSteps, setCompletedSteps] = useState([])
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  // Auto-validate domain once site is available
  useEffect(() => {
    if (step === STEPS.VALIDATING && (site_id || selected_site)) {
      executeValidation()
    }
  }, [step, site_id, selected_site])

  // Auto-estimate cost after validation
  useEffect(() => {
    if (step === STEPS.ESTIMATING_COST && validation_result && onEstimateCost) {
      const executeEstimate = async () => {
        try {
          const site = site_id
            ? sites.find(s => s.object_id === site_id)
            : selected_site

          if (!site) {
            throw new Error('Site not found')
          }

          const gas_cost = await onEstimateCost(domain, site)
          setGasCostEstimate(gas_cost)
          advanceStep(STEPS.CONFIRM, { estimatedGas: gas_cost })
        } catch (err) {
          // Non-critical - proceed without cost estimate
          setGasCostEstimate(null)
          advanceStep(STEPS.CONFIRM)
        }
      }

      executeEstimate()
    }
  }, [step, validation_result])

  const advanceStep = (nextStep, data = {}) => {
    if (step !== nextStep) {
      const stepLog = getStepLog(step, data)
      if (stepLog) {
        setCompletedSteps(prev => [...prev, stepLog])
      }
    }
    setStep(nextStep)
  }

  const getStepLog = (completedStep, data) => {
    switch (completedStep) {
      case STEPS.SELECT_SITE:
        return `✓ Site selected: ${data.siteName}`
      case STEPS.VALIDATING:
        return `✓ Domain validated: ${domain}`
      case STEPS.ESTIMATING_COST:
        if (data.estimatedGas) {
          const sui_cost = (data.estimatedGas / 1_000_000_000).toFixed(4)
          return `✓ Gas cost: ${sui_cost} SUI (dry-run)`
        }
        return null
      case STEPS.EXECUTING:
        return `✓ Domain registered on-chain`
      default:
        return null
    }
  }

  const handleSiteSelect = site => {
    setSelectedSite(site)
    if (onSiteSelect) {
      onSiteSelect(site)
    }
    advanceStep(STEPS.VALIDATING, { siteName: site.name })
  }

  const executeValidation = async () => {
    try {
      const site = site_id
        ? sites.find(s => s.object_id === site_id)
        : selected_site

      if (!site) {
        throw new Error('Site not found')
      }

      const validation = await onValidateDomain(domain, site)
      setValidationResult(validation)

      if (!validation.valid) {
        setError(validation.error)
        if (onError) {
          onError(new Error(validation.error))
        }
        return
      }

      advanceStep(STEPS.ESTIMATING_COST)
    } catch (err) {
      setError(err.message)
      if (onError) {
        onError(err)
      }
    }
  }

  const handleConfirm = async () => {
    advanceStep(STEPS.EXECUTING)

    try {
      const site = site_id
        ? sites.find(s => s.object_id === site_id)
        : selected_site

      const tx_result = await onExecute(domain, site)
      setResult(tx_result)
      advanceStep(STEPS.DONE, { txDigest: tx_result.digest })

      if (onComplete) {
        onComplete(tx_result)
      }
    } catch (err) {
      setError(err.message)
      if (onError) {
        onError(err)
      }
    }
  }

  const renderCurrentStep = () => {
    const needs_top_margin = completedSteps.length === 0

    return React.createElement(
      Box,
      { flexDirection: 'column', marginTop: needs_top_margin ? 2 : 0 },

      // Error display
      error &&
        React.createElement(
          Box,
          { marginBottom: 1, paddingLeft: 2 },
          React.createElement(Text, { color: COLORS.error }, '✗ ', error),
        ),

      // SELECT_SITE
      step === STEPS.SELECT_SITE &&
        React.createElement(SiteSelector, {
          sites,
          on_select: handleSiteSelect,
          is_loading: is_loading_sites,
        }),

      // VALIDATING
      step === STEPS.VALIDATING &&
        React.createElement(ProgressSpinner, {
          message: `Validating domain: ${domain}`,
          color: COLORS.sui,
        }),

      // ESTIMATING_COST
      step === STEPS.ESTIMATING_COST &&
        React.createElement(ProgressSpinner, {
          message: 'Checking gas cost (dry-run)...',
          color: COLORS.sui,
        }),

      // CONFIRM
      step === STEPS.CONFIRM &&
        validation_result &&
        React.createElement(
          Box,
          { flexDirection: 'column', paddingLeft: 2 },
          React.createElement(
            Box,
            { marginBottom: 1 },
            React.createElement(
              Text,
              { bold: true, color: 'yellow' },
              '⚠  Configure DNS for domain?',
            ),
          ),
          React.createElement(
            Box,
            { paddingLeft: 3 },
            React.createElement(Text, { dimColor: true }, `Domain: ${domain}`),
          ),
          React.createElement(
            Box,
            { paddingLeft: 3 },
            React.createElement(
              Text,
              { dimColor: true },
              `Site: ${selected_site?.name || 'Unknown'}`,
            ),
          ),
          React.createElement(
            Box,
            { paddingLeft: 3, marginTop: 1 },
            React.createElement(
              Text,
              { color: COLORS.warning },
              '⚠ After registration, configure these DNS records:',
            ),
          ),
          React.createElement(
            Box,
            { paddingLeft: 5 },
            React.createElement(Text, { dimColor: true }, 'Type:   CNAME'),
          ),
          React.createElement(
            Box,
            { paddingLeft: 5 },
            React.createElement(
              Text,
              { dimColor: true },
              'Name:   @ (or subdomain)',
            ),
          ),
          React.createElement(
            Box,
            { paddingLeft: 5 },
            React.createElement(Text, { dimColor: true }, 'Target: versui.app'),
          ),
          React.createElement(
            Box,
            { marginTop: 1, paddingLeft: 3 },
            React.createElement(
              Text,
              { color: 'cyan' },
              gas_cost_estimate
                ? `⛓ ${(gas_cost_estimate / 1_000_000_000).toFixed(4)} SUI`
                : '⛓ This will execute a transaction',
            ),
          ),
          React.createElement(
            Box,
            { marginTop: 1, paddingLeft: 3 },
            React.createElement(
              Text,
              { dimColor: true },
              '[Y] Confirm & Pay  [N] Cancel',
            ),
          ),
        ),

      // EXECUTING
      step === STEPS.EXECUTING &&
        React.createElement(ProgressSpinner, {
          message: 'Registering domain on-chain...',
          color: COLORS.sui,
        }),

      // DONE
      step === STEPS.DONE &&
        result &&
        React.createElement(
          Box,
          { flexDirection: 'column', paddingLeft: 2, marginTop: 1 },
          React.createElement(
            Text,
            { color: COLORS.success, bold: true },
            '✓ Domain registered!',
          ),
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(Text, { dimColor: true }, 'Domain: ', domain),
          ),
          result.digest &&
            React.createElement(
              Box,
              null,
              React.createElement(
                Text,
                { dimColor: true },
                'TX: ',
                result.digest.slice(0, 20),
                '...',
              ),
            ),
          React.createElement(
            Box,
            { flexDirection: 'column', marginTop: 1 },
            React.createElement(
              Text,
              { bold: true },
              'Configure DNS:',
            ),
            React.createElement(
              Text,
              { dimColor: true },
              '  Type:   CNAME',
            ),
            React.createElement(
              Text,
              { dimColor: true },
              '  Name:   @ (or your subdomain)',
            ),
            React.createElement(
              Text,
              { dimColor: true },
              '  Target: versui.app',
            ),
          ),
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { color: COLORS.warning },
              '⚠ DNS propagation may take up to 48 hours',
            ),
          ),
        ),
    )
  }

  // Handle keyboard input for confirmation
  useInput((input, key) => {
    if (step !== STEPS.CONFIRM) return

    const lower_input = input.toLowerCase()
    if (lower_input === 'y') {
      handleConfirm()
    } else if (lower_input === 'n' || key.escape) {
      setError('Operation cancelled by user')
      if (onError) {
        onError(new Error('User cancelled operation'))
      }
    }
  })

  return React.createElement(
    Box,
    { flexDirection: 'column' },

    // Header
    React.createElement(Static, { items: [{ id: 'header' }] }, item =>
      React.createElement(Header, { key: item.id }),
    ),

    // Completed steps
    completedSteps.length > 0 &&
      React.createElement(
        Box,
        { flexDirection: 'column', marginTop: 1, paddingLeft: 2 },
        completedSteps.map((log, idx) =>
          React.createElement(Text, { key: idx }, completed_gradient(log)),
        ),
      ),

    // Current step
    renderCurrentStep(),
  )
}
