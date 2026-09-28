import type { HomeOverviewData, UsagePeriod } from '../model/home-types'
import { UsageSummary } from './UsageSummary'

type HomeOverviewProps = {
  data: HomeOverviewData
  onPeriodChange: (period: UsagePeriod) => void
}

export function HomeOverview({ data, onPeriodChange }: HomeOverviewProps) {
  return (
    <div className="home-overview">
      {data.isDemo ? <p className="home-demo-badge">Datos de demostración</p> : null}
      <UsageSummary usage={data.usage} onPeriodChange={onPeriodChange} />
    </div>
  )
}

