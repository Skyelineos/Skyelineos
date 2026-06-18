/**
 * Tiny weather card for the Project Overview redesign — sits next to the
 * jobsite map. Builds the query string from the project's address (latitude/
 * longitude when available, falls back to the formatted address). Renders
 * the next-3-day forecast inline so the GC can see "rain Thursday → push the
 * concrete pour out a day" without leaving the page.
 */

import { useMemo } from 'react';
import { useWeather } from '@/hooks/useWeather';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, AlertCircle, Loader2 } from 'lucide-react';
import { locationFromProject, formatAddress } from '@/lib/buildLocation';

interface Props {
  project: any;
}

export function ProjectWeatherCard({ project }: Props) {
  const queryStr = useMemo(() => {
    const loc = locationFromProject(project);
    if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      return `${loc.latitude},${loc.longitude}`;
    }
    return formatAddress(loc);
  }, [project]);

  const { data, isLoading, error } = useWeather(queryStr);

  if (!queryStr) {
    return (
      <Card className="bg-gray-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#C9A96E]" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500">
            Set a job-site address on the project to see weather.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#C9A96E]" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading forecast…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#C9A96E]" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-xs text-amber-700">
          <AlertCircle className="w-4 h-4" />
          Forecast unavailable. {String((error as any)?.message || '')}
        </CardContent>
      </Card>
    );
  }

  const today = data.forecast.forecastday[0];
  const next = data.forecast.forecastday.slice(1, 4);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="w-4 h-4 text-[#C9A96E]" />
          Weather — {data.location.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          {data.current.condition.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(data.current.condition.icon || '').replace(/^\/\//, 'https://')}
              alt={data.current.condition.text}
              className="w-12 h-12"
            />
          )}
          <div>
            <div className="text-xl font-semibold font-mono">{Math.round(data.current.temp_f)}°F</div>
            <div className="text-xs text-gray-500">{data.current.condition.text} · Feels {Math.round(data.current.feelslike_f)}°</div>
          </div>
          <div className="ml-auto text-right text-xs text-gray-500">
            <div>H {Math.round(today.day.maxtemp_f)}°</div>
            <div>L {Math.round(today.day.mintemp_f)}°</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {next.map(d => {
            const dt = new Date(d.date);
            const label = dt.toLocaleDateString(undefined, { weekday: 'short' });
            const rain = d.day.daily_chance_of_rain;
            return (
              <div key={d.date} className="rounded-md border border-gray-100 bg-white p-2">
                <div className="text-[11px] text-gray-500">{label}</div>
                {d.day.condition.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(d.day.condition.icon || '').replace(/^\/\//, 'https://')}
                    alt={d.day.condition.text}
                    className="w-8 h-8 mx-auto"
                  />
                )}
                <div className="text-xs font-mono text-gray-700">
                  {Math.round(d.day.maxtemp_f)}° / {Math.round(d.day.mintemp_f)}°
                </div>
                {rain >= 30 && (
                  <div className="text-[10px] text-blue-600 mt-0.5">{rain}% rain</div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default ProjectWeatherCard;
