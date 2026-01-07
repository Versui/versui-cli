import React from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import Spinner from 'ink-spinner'

export function SiteSelector({ sites, on_select, is_loading = false }) {
  if (is_loading) {
    return React.createElement(
      Box,
      { flexDirection: 'column', paddingLeft: 2 },
      React.createElement(
        Box,
        null,
        React.createElement(
          Text,
          { color: 'cyan' },
          React.createElement(Spinner, { type: 'dots' }),
          ' Loading your sites...',
        ),
      ),
    )
  }

  if (!sites || sites.length === 0) {
    return React.createElement(
      Box,
      { flexDirection: 'column', paddingLeft: 2 },
      React.createElement(
        Text,
        { color: 'yellow' },
        'No sites found. Deploy a site first with "versui deploy"',
      ),
    )
  }

  const items = sites.map(site => ({
    label: `${site.name || 'Unnamed'} (${site.object_id.slice(0, 8)}...) - ${site.resource_count || 0} resources`,
    value: site.object_id,
    site,
  }))

  return React.createElement(
    Box,
    { flexDirection: 'column', paddingLeft: 2 },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        { bold: true, color: 'cyan' },
        'Select a site:',
      ),
    ),
    React.createElement(SelectInput, {
      items,
      onSelect: item => on_select?.(item.site),
    }),
  )
}
