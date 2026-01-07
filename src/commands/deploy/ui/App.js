import React, { useState, useEffect } from 'react'
import { Box, Text, Static } from 'ink'
import TextInput from 'ink-text-input'
import SelectInput from 'ink-select-input'
import Spinner from 'ink-spinner'
import gradient from 'gradient-string'

import { Header } from './Header.js'
import { StepIndicator } from './StepIndicator.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { GlowingBox } from './GlowingBox.js'
import { encode_base36 } from '../../../lib/base36.js'

// Gradient for completed step logs
const completed_gradient = gradient(['#2DD4BF', '#4DA2FF'])

const COLORS = {
  sui: '#4DA2FF', // Sui primary blue
  accent: '#00D4FF', // Cyan accent
  success: '#2DD4BF', // Teal success
  error: '#F43F5E', // Red error
  dim: '#64748B', // Slate dim
}

const STEPS = {
  NAME: 'name',
  NETWORK: 'network',
  DURATION: 'duration',
  SCANNING: 'scanning',
  CHECKING_SITE: 'checking_site',
  WALRUS_UPLOAD: 'walrus_upload',
  ESTIMATING_COST: 'estimating_cost',
  DEPLOY_CONFIRM: 'deploy_confirm',
  SUI_CREATE: 'sui_create',
  RESOURCES_ADD: 'resources_add',
  SW_CHECK: 'sw_check',
  DONE: 'done',
}

const NETWORK_OPTIONS = [
  { label: 'Testnet', value: 'testnet' },
  { label: 'Mainnet', value: 'mainnet' },
]

const STEPS_CONFIG = [
  { key: 'scan', label: 'Scan files', shortLabel: 'Scan' },
  { key: 'walrus', label: 'Upload to Walrus', shortLabel: 'Upload' },
  { key: 'site', label: 'Create Site on Sui', shortLabel: 'Create' },
  { key: 'resources', label: 'Add Resources', shortLabel: 'Resources' },
]

// Map step enum to step indicator index
const STEP_TO_INDEX = {
  [STEPS.NAME]: -1,
  [STEPS.NETWORK]: -1,
  [STEPS.DURATION]: -1,
  [STEPS.SCANNING]: 0,
  [STEPS.CHECKING_SITE]: 0,
  [STEPS.WALRUS_UPLOAD]: 1,
  [STEPS.ESTIMATING_COST]: 1,
  [STEPS.DEPLOY_CONFIRM]: 2,
  [STEPS.SUI_CREATE]: 2,
  [STEPS.RESOURCES_ADD]: 3,
  [STEPS.SW_CHECK]: 3,
  [STEPS.DONE]: 4,
}

export default function App({
  directory,
  name = '',
  network = '',
  epochs = null,
  autoYes = false,
  onStepChange,
  onComplete,
  onError,
}) {
  const [step, setStep] = useState(STEPS.NAME)
  const [siteName, setSiteName] = useState(name)
  const [selectedNetwork, setSelectedNetwork] = useState(network)
  const [duration, setDuration] = useState(epochs?.toString() || '')
  const [completedSteps, setCompletedSteps] = useState([])
  const [completedStepIndices, setCompletedStepIndices] = useState([])
  const [spinnerText, setSpinnerText] = useState('')
  const [progressInfo, setProgressInfo] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [walrusResult, setWalrusResult] = useState(null)
  const [costResult, setCostResult] = useState(null)
  const [suiResult, setSuiResult] = useState(null)

  // Auto-advance if values are pre-filled
  useEffect(() => {
    if (name && siteName && step === STEPS.NAME) {
      handleNameSubmit()
    }
  }, [siteName])

  useEffect(() => {
    if (network && step === STEPS.NETWORK) {
      handleNetworkSelect({ value: network })
    }
  }, [step])

  useEffect(() => {
    if (epochs && step === STEPS.DURATION) {
      handleDurationSubmit()
    }
  }, [step])

  // Step transition handler
  const advanceStep = (nextStep, data = {}) => {
    // Log completed step
    if (step !== nextStep) {
      const stepLog = getStepLog(step, data)
      if (stepLog) {
        setCompletedSteps(prev => [...prev, stepLog])
      }

      // Track completed step index
      const currentStepIndex = STEP_TO_INDEX[step]
      if (
        currentStepIndex >= 0 &&
        !completedStepIndices.includes(currentStepIndex)
      ) {
        setCompletedStepIndices(prev => [...prev, currentStepIndex])
      }
    }

    setStep(nextStep)
  }

  // Generate log entry for completed step
  const getStepLog = (completedStep, data) => {
    switch (completedStep) {
      case STEPS.NAME:
        return `✓ Site name: ${siteName}`
      case STEPS.NETWORK:
        return `✓ Network: ${selectedNetwork}`
      case STEPS.DURATION:
        return `✓ Duration: ${duration} epochs`
      case STEPS.SCANNING:
        const cost_info =
          data.walrusCost != null
            ? ` | ${data.walrusCost.toFixed(2)} WAL`
            : ''
        return `✓ Scanned ${data.fileCount || 0} files (${data.totalSize || '0 B'})${cost_info}`
      case STEPS.CHECKING_SITE:
        return `✓ Site name is available`
      case STEPS.WALRUS_UPLOAD:
        return `✓ Uploaded to Walrus: ${data.blobId || 'unknown'}`
      case STEPS.ESTIMATING_COST:
        return null
      case STEPS.SUI_CREATE:
        return `✓ Site created on Sui: ${data.siteId || 'unknown'}`
      case STEPS.RESOURCES_ADD:
        return `✓ Resources added to site`
      case STEPS.SW_CHECK:
        return data.hasServiceWorker
          ? `✓ Service worker detected`
          : `⚠ No service worker found`
      default:
        return null
    }
  }

  // Input handlers
  const handleNameSubmit = () => {
    if (!siteName.trim()) {
      setError('Site name cannot be empty')
      return
    }
    setError(null)
    advanceStep(network ? STEPS.DURATION : STEPS.NETWORK)
  }

  const handleNetworkSelect = item => {
    setSelectedNetwork(item.value)
    advanceStep(epochs ? STEPS.SCANNING : STEPS.DURATION)
  }

  const handleDurationSubmit = () => {
    const parsedDuration = parseInt(duration, 10)
    if (isNaN(parsedDuration) || parsedDuration < 1) {
      setError('Duration must be a positive number')
      return
    }
    setError(null)
    advanceStep(STEPS.SCANNING)
  }

  const handleConfirm = (confirmed, nextStep) => {
    if (!confirmed) {
      if (onError) {
        onError(new Error('User cancelled operation'))
      }
      return
    }
    advanceStep(nextStep)
  }

  const handleComplete = finalResult => {
    setResult(finalResult)
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

  // Update spinner text externally
  useEffect(() => {
    if (step === STEPS.SCANNING) {
      setSpinnerText('Scanning directory...')
      setProgressInfo('')
    } else if (step === STEPS.CHECKING_SITE) {
      setSpinnerText('Checking site availability...')
      setProgressInfo('')
    } else if (step === STEPS.WALRUS_UPLOAD) {
      setSpinnerText('Uploading to Walrus...')
      setProgressInfo('')
    } else if (step === STEPS.ESTIMATING_COST) {
      setSpinnerText('Checking Sui gas cost (dry-run)...')
      setProgressInfo('')
    } else if (step === STEPS.SUI_CREATE) {
      setSpinnerText('Creating site on Sui...')
      setProgressInfo('')
    } else if (step === STEPS.RESOURCES_ADD) {
      setSpinnerText('Adding resources...')
      setProgressInfo('')
    } else if (step === STEPS.SW_CHECK) {
      setSpinnerText('Checking for service worker...')
      setProgressInfo('')
    }
  }, [step])

  // Handler: SCANNING step
  useEffect(() => {
    if (step !== STEPS.SCANNING || !onStepChange) return

    const executeScan = async () => {
      try {
        const data = await onStepChange('scanning', {
          directory,
          epochs: parseInt(duration, 10),
        })
        setScanResult(data)
        const file_count = data.files?.length || 0
        setProgressInfo(`${file_count} files found`)
        advanceStep(STEPS.CHECKING_SITE, {
          fileCount: file_count,
          totalSize: data.totalSize || '0 B',
          walrusCost: data.walrusCost,
        })
      } catch (err) {
        handleError(err)
      }
    }

    executeScan()
  }, [step])

  // Handler: CHECKING_SITE step
  useEffect(() => {
    if (step !== STEPS.CHECKING_SITE || !onStepChange) return

    const executeCheckSite = async () => {
      try {
        const data = await onStepChange('checking_site', {
          name: siteName,
        })
        advanceStep(STEPS.WALRUS_UPLOAD)
      } catch (err) {
        handleError(err)
      }
    }

    executeCheckSite()
  }, [step])


  // Handler: WALRUS_UPLOAD step
  useEffect(() => {
    if (step !== STEPS.WALRUS_UPLOAD || !onStepChange || !scanResult) return

    const executeWalrusUpload = async () => {
      try {
        const data = await onStepChange('walrus_upload', {
          files: scanResult.files,
          epochs: parseInt(duration, 10),
          network: selectedNetwork,
        })
        setWalrusResult(data)
        advanceStep(STEPS.ESTIMATING_COST, {
          blobId: data.blobId,
        })
      } catch (err) {
        handleError(err)
      }
    }

    executeWalrusUpload()
  }, [step, scanResult])

  // Handler: ESTIMATING_COST step
  useEffect(() => {
    if (
      step !== STEPS.ESTIMATING_COST ||
      !onStepChange ||
      !walrusResult ||
      !scanResult
    )
      return

    const executeEstimateCost = async () => {
      try {
        const data = await onStepChange('estimating_cost', {
          name: siteName,
          patches: walrusResult.patches,
          metadata: scanResult.metadata,
          network: selectedNetwork,
        })
        setCostResult(data)
        advanceStep(STEPS.DEPLOY_CONFIRM, {
          suiCost: data.suiCost,
        })
      } catch (err) {
        handleError(err)
      }
    }

    executeEstimateCost()
  }, [step, walrusResult, scanResult])

  // Handler: Auto-advance DEPLOY_CONFIRM if autoYes
  useEffect(() => {
    if (step === STEPS.DEPLOY_CONFIRM && autoYes) {
      advanceStep(STEPS.SUI_CREATE)
    }
  }, [step, autoYes])

  // Handler: SUI_CREATE step
  useEffect(() => {
    if (step !== STEPS.SUI_CREATE || !onStepChange || !walrusResult) return

    const executeSuiCreate = async () => {
      try {
        const data = await onStepChange('sui_create', {
          name: siteName,
          network: selectedNetwork,
          blobId: walrusResult.blobId,
        })
        setSuiResult(data)
        advanceStep(STEPS.RESOURCES_ADD, {
          siteId: data.siteId,
        })
      } catch (err) {
        handleError(err)
      }
    }

    executeSuiCreate()
  }, [step, walrusResult])

  // Handler: RESOURCES_ADD step
  useEffect(() => {
    if (
      step !== STEPS.RESOURCES_ADD ||
      !onStepChange ||
      !suiResult ||
      !walrusResult
    )
      return

    const executeResourcesAdd = async () => {
      try {
        const data = await onStepChange('resources_add', {
          siteId: suiResult.siteId,
          adminCapId: suiResult.adminCapId,
          initialSharedVersion: suiResult.initialSharedVersion,
          patches: walrusResult.patches,
          metadata: scanResult.metadata,
          network: selectedNetwork,
        })
        advanceStep(STEPS.SW_CHECK, { txDigest: data.txDigest })
      } catch (err) {
        handleError(err)
      }
    }

    executeResourcesAdd()
  }, [step, suiResult, walrusResult])

  // Handler: SW_CHECK step
  useEffect(() => {
    if (step !== STEPS.SW_CHECK || !onStepChange) return

    const executeSwCheck = async () => {
      try {
        const data = await onStepChange('sw_check', { directory })

        // Build final result
        const finalResult = {
          siteId: suiResult?.siteId,
          adminCapId: suiResult?.adminCapId,
          blobId: walrusResult?.blobId,
          blobObjectId: walrusResult?.blobObjectId,
          url: `https://${encode_base36(suiResult.siteId)}.versui.app`,
          hasServiceWorker: data.hasServiceWorker,
        }

        handleComplete(finalResult)
      } catch (err) {
        handleError(err)
      }
    }

    executeSwCheck()
  }, [step, suiResult, walrusResult])

  // Helper to render current step content
  const renderCurrentStep = () => {
    // Add top margin only if there are no completed steps (first interactive element)
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
      step === STEPS.NAME &&
        React.createElement(
          Box,
          { flexDirection: 'column', width: 60, alignItems: 'center' },
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { color: '#78716C', italic: true },
              "Your site's unique identifier on the Sui network",
            ),
          ),
          React.createElement(
            Box,
            { marginTop: 1, alignSelf: 'flex-start' },
            React.createElement(Text, { color: '#FFFBEB' }, '❯ Site name: '),
            React.createElement(TextInput, {
              value: siteName || '',
              onChange: setSiteName,
              onSubmit: handleNameSubmit,
            }),
          ),
        ),
      step === STEPS.NETWORK &&
        React.createElement(
          Box,
          { flexDirection: 'column', width: 60, alignItems: 'center' },
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { color: '#78716C', italic: true },
              'Choose testnet for development or mainnet for production',
            ),
          ),
          React.createElement(
            Box,
            { marginTop: 1, alignSelf: 'flex-start' },
            React.createElement(
              Text,
              { color: '#FFFBEB' },
              '❯ Network [testnet/mainnet]: ',
            ),
            React.createElement(SelectInput, {
              items: NETWORK_OPTIONS,
              onSelect: handleNetworkSelect,
            }),
          ),
        ),
      step === STEPS.DURATION &&
        React.createElement(
          Box,
          { flexDirection: 'column', width: 60, alignItems: 'center' },
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { color: '#78716C', italic: true },
              'How long to store files on Walrus (1 epoch ≈ 1 day)',
            ),
          ),
          React.createElement(
            Box,
            { marginTop: 1, alignSelf: 'flex-start' },
            React.createElement(Text, { color: '#FFFBEB' }, '❯ Epochs [1]: '),
            React.createElement(TextInput, {
              value: duration || '',
              onChange: setDuration,
              onSubmit: handleDurationSubmit,
            }),
          ),
        ),
      step === STEPS.SCANNING &&
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
      step === STEPS.CHECKING_SITE &&
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
      step === STEPS.WALRUS_UPLOAD &&
        React.createElement(
          GlowingBox,
          { color: COLORS.sui },
          React.createElement(
            Text,
            { color: COLORS.sui },
            React.createElement(Spinner, { type: 'line' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.ESTIMATING_COST &&
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
      step === STEPS.DEPLOY_CONFIRM &&
        !autoYes &&
        React.createElement(ConfirmDialog, {
          title: 'Deploy to blockchain?',
          details: walrusResult && scanResult
            ? [
                `Site name: ${siteName}`,
                `Files: ${scanResult.files?.length || 0}`,
                `Total size: ${scanResult.totalSize || '0 B'}`,
                `Blob ID: ${walrusResult.blobId}`,
                `Network: ${selectedNetwork}`,
              ]
            : [],
          costValue:
            costResult?.suiCost != null
              ? `${costResult.suiCost.toFixed(4)} SUI`
              : null,
          onConfirm: confirmed => handleConfirm(confirmed, STEPS.SUI_CREATE),
          onCancel: confirmed => handleConfirm(confirmed, STEPS.SUI_CREATE),
        }),
      step === STEPS.SUI_CREATE &&
        React.createElement(
          GlowingBox,
          { color: COLORS.sui },
          React.createElement(
            Text,
            { color: COLORS.sui },
            React.createElement(Spinner, { type: 'bouncingBar' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.RESOURCES_ADD &&
        React.createElement(
          GlowingBox,
          { color: COLORS.sui },
          React.createElement(
            Text,
            { color: COLORS.sui },
            React.createElement(Spinner, { type: 'arc' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.SW_CHECK &&
        React.createElement(
          GlowingBox,
          { color: COLORS.sui },
          React.createElement(
            Text,
            { color: COLORS.sui },
            React.createElement(Spinner, { type: 'dots12' }),
            ' ',
            spinnerText,
            progressInfo ? ` - ${progressInfo}` : '',
          ),
        ),
      step === STEPS.DONE &&
        result &&
        React.createElement(
          Box,
          { flexDirection: 'column', marginTop: 1 },
          React.createElement(
            Text,
            { color: COLORS.success, bold: true },
            '✓ Deployment complete!',
          ),
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { dimColor: true },
              'Site ID: ',
              result.siteId,
            ),
          ),
          React.createElement(
            Box,
            null,
            React.createElement(
              Text,
              { dimColor: true },
              'Blob ID: ',
              result.blobId,
            ),
          ),
          result.url &&
            React.createElement(
              Box,
              { marginTop: 1 },
              React.createElement(
                Text,
                { color: COLORS.accent },
                'URL: ',
                result.url,
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

    // 2. Completed steps (marginTop: 1 for spacing from header)
    completedSteps.length > 0 &&
      React.createElement(
        Box,
        { flexDirection: 'column', marginTop: 1 },
        completedSteps.map((log, idx) =>
          React.createElement(Text, { key: idx }, completed_gradient(log)),
        ),
      ),

    // 3. Current step content (no separator above)
    renderCurrentStep(),

    // 4. SINGLE separator before footer (only if not DONE)
    step !== STEPS.DONE &&
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(Text, { color: COLORS.dim }, '━'.repeat(55)),
      ),

    // 5. Footer - Step indicator (only if not DONE)
    step !== STEPS.DONE &&
      React.createElement(StepIndicator, {
        steps: STEPS_CONFIG,
        currentStep: STEP_TO_INDEX[step],
        completedSteps: completedStepIndices,
      }),
  )
}
