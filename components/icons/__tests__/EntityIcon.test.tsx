/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React from 'react'
import { render, screen } from '@testing-library/react-native'

// react-native-svg has native bindings — stub SvgUri / SvgXml so jest doesn't
// try to load the native module. We render simple text placeholders that the
// tests can find by content.
jest.mock('react-native-svg', () => {
  const ReactActual = jest.requireActual('react') as typeof import('react')
  return {
    SvgUri: (props: { uri: string }) =>
      ReactActual.createElement('Text', null, `SvgUri:${props.uri}`),
    SvgXml: (props: { xml: string }) =>
      ReactActual.createElement('Text', null, `SvgXml:${props.xml.slice(0, 20)}`),
  }
})

// useSpecialtyIcons is the per-specialty image/SVG record cache. Tests
// control what the hook returns to exercise the specialty branches.
const mockUseSpecialtyIcons = jest.fn().mockReturnValue({ data: undefined })
jest.mock('@/hooks/use-specialty-icons', () => ({
  useSpecialtyIcons: () => mockUseSpecialtyIcons(),
}))

import { EntityIcon } from '../EntityIcon'

describe('<EntityIcon> resolution chain', () => {
  beforeEach(() => {
    mockUseSpecialtyIcons.mockReset().mockReturnValue({ data: undefined })
  })

  it('renders the imageUrl branch when imageUrl is set', () => {
    render(
      <EntityIcon
        type="patient"
        imageUrl="https://cdn.example/photo.jpg"
        name="Jane Doe"
      />,
    )
    const root = screen.getByTestId('entity-icon-root')
    expect(root.props['data-entity-icon']).toBe('image:patient')
    expect(root.props.accessibilityLabel).toBe('Jane Doe')
  })

  it('renders the iconUrl branch (SvgUri) when imageUrl is null but iconUrl is set', () => {
    render(
      <EntityIcon
        type="agency"
        imageUrl={null}
        iconUrl="https://cdn.example/icons/nurse.svg"
        name="Acme Care"
      />,
    )
    const root = screen.getByTestId('entity-icon-root')
    expect(root.props['data-entity-icon']).toBe('icon-url:agency')
    expect(screen.getByText('SvgUri:https://cdn.example/icons/nurse.svg')).toBeTruthy()
  })

  it('imageUrl beats iconUrl when both are set', () => {
    render(
      <EntityIcon
        type="agency"
        imageUrl="https://cdn.example/photo.jpg"
        iconUrl="https://cdn.example/icons/nurse.svg"
        name="Acme"
      />,
    )
    const root = screen.getByTestId('entity-icon-root')
    expect(root.props['data-entity-icon']).toBe('image:agency')
    // SvgUri should NOT have been rendered
    expect(screen.queryByText(/SvgUri:/)).toBeNull()
  })

  it('renders the specialty-image branch when hook provides an imageUrl record', () => {
    mockUseSpecialtyIcons.mockReturnValue({
      data: { cardiology: { imageUrl: 'https://cdn.example/specialty/cardiology.png' } },
    })
    render(
      <EntityIcon
        type="provider"
        specialty="Cardiology"
        name="Dr Smith"
      />,
    )
    const root = screen.getByTestId('entity-icon-root')
    expect(root.props['data-entity-icon']).toBe('specialty-image:cardiology')
  })

  it('renders the specialty-svg branch when hook provides only inline svg', () => {
    mockUseSpecialtyIcons.mockReturnValue({
      data: { nursing: { svg: '<svg><path d="..."/></svg>' } },
    })
    render(
      <EntityIcon
        type="provider"
        specialty="Registered Nurse"
        name="Hayley Walter"
      />,
    )
    const root = screen.getByTestId('entity-icon-root')
    expect(root.props['data-entity-icon']).toBe('specialty-svg:nursing')
    expect(screen.getByText(/SvgXml:/)).toBeTruthy()
  })

  it('iconUrl beats specialty for a provider', () => {
    mockUseSpecialtyIcons.mockReturnValue({
      data: { cardiology: { svg: '<svg/>' } },
    })
    render(
      <EntityIcon
        type="provider"
        iconUrl="https://cdn.example/icons/custom-doc.svg"
        specialty="Cardiology"
        name="Dr Smith"
      />,
    )
    expect(screen.getByTestId('entity-icon-root').props['data-entity-icon']).toBe(
      'icon-url:provider',
    )
  })
})

describe('<EntityIcon> initials fallback', () => {
  beforeEach(() => {
    mockUseSpecialtyIcons.mockReset().mockReturnValue({ data: undefined })
  })

  it('falls back to initials when imageUrl / iconUrl / specialty are all absent', () => {
    render(<EntityIcon type="patient" name="Jane Doe" />)
    const root = screen.getByTestId('entity-icon-root')
    expect(root.props['data-entity-icon']).toBe('initials:patient')
    expect(screen.getByText('JD')).toBeTruthy()
  })

  it('strips title and credential when computing initials', () => {
    render(<EntityIcon type="provider" name="Dr. Hayley A. Walter, MD" />)
    // "Dr." and "MD" are titles/credentials, "Walter" should be the last
    // non-title token. First initial H + last initial W → "HW".
    expect(screen.getByText('HW')).toBeTruthy()
  })

  it('uses first two characters of a single-word name', () => {
    render(<EntityIcon type="patient" name="Hayley" />)
    expect(screen.getByText('HA')).toBeTruthy()
  })

  it('shows "?" when name is undefined', () => {
    render(<EntityIcon type="patient" />)
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('shows "?" when name is empty string', () => {
    render(<EntityIcon type="patient" name="" />)
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('shows "?" when name is only a title (no usable token after filtering)', () => {
    render(<EntityIcon type="provider" name="Dr." />)
    expect(screen.getByText('?')).toBeTruthy()
  })
})

describe('<EntityIcon> size resolution', () => {
  beforeEach(() => {
    mockUseSpecialtyIcons.mockReset().mockReturnValue({ data: undefined })
  })

  it('sm → 32px wrapper', () => {
    render(<EntityIcon type="patient" name="X" size="sm" />)
    const root = screen.getByTestId('entity-icon-root')
    const style = Array.isArray(root.props.style) ? root.props.style[0] : root.props.style
    expect(style.width).toBe(32)
    expect(style.height).toBe(32)
  })

  it('md (default) → 48px wrapper', () => {
    render(<EntityIcon type="patient" name="X" />)
    const root = screen.getByTestId('entity-icon-root')
    const style = Array.isArray(root.props.style) ? root.props.style[0] : root.props.style
    expect(style.width).toBe(48)
    expect(style.height).toBe(48)
  })

  it('lg → 96px wrapper', () => {
    render(<EntityIcon type="patient" name="X" size="lg" />)
    const root = screen.getByTestId('entity-icon-root')
    const style = Array.isArray(root.props.style) ? root.props.style[0] : root.props.style
    expect(style.width).toBe(96)
    expect(style.height).toBe(96)
  })

  it('numeric size override → custom px', () => {
    render(<EntityIcon type="patient" name="X" size={128} />)
    const root = screen.getByTestId('entity-icon-root')
    const style = Array.isArray(root.props.style) ? root.props.style[0] : root.props.style
    expect(style.width).toBe(128)
    expect(style.height).toBe(128)
  })
})

describe('<EntityIcon> accessibilityLabel', () => {
  it('uses name when provided', () => {
    render(<EntityIcon type="patient" name="Jane Doe" />)
    expect(screen.getByTestId('entity-icon-root').props.accessibilityLabel).toBe(
      'Jane Doe',
    )
  })

  it('falls back to type when name is undefined', () => {
    render(<EntityIcon type="agency" />)
    expect(screen.getByTestId('entity-icon-root').props.accessibilityLabel).toBe(
      'agency',
    )
  })
})
