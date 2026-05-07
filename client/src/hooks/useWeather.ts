import { useQuery } from '@tanstack/react-query';

interface WeatherData {
  location: {
    name: string;
    region: string;
    country: string;
  };
  current: {
    temp_f: number;
    temp_c: number;
    condition: {
      text: string;
      icon: string;
    };
    humidity: number;
    wind_mph: number;
    feelslike_f: number;
    feelslike_c: number;
  };
  forecast: {
    forecastday: Array<{
      date: string;
      day: {
        maxtemp_f: number;
        maxtemp_c: number;
        mintemp_f: number;
        mintemp_c: number;
        condition: {
          text: string;
          icon: string;
        };
        daily_chance_of_rain: number;
      };
    }>;
  };
}

export function useWeather(location: string) {
  return useQuery({
    queryKey: ['weather', location],
    queryFn: async (): Promise<WeatherData> => {
      const apiKey = import.meta.env.VITE_OWM_API_KEY;
      if (!apiKey) {
        throw new Error('Weather API key not configured');
      }
      
      const response = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(location)}&days=7&aqi=no&alerts=no`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch weather data');
      }
      
      return response.json();
    },
    enabled: !!location,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 15 * 60 * 1000, // 15 minutes
  });
}