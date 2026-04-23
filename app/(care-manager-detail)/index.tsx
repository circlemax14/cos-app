import { Redirect, useLocalSearchParams } from 'expo-router';

export default function CareManagerDetailRedirect() {
  const params = useLocalSearchParams();
  return <Redirect href={`/agency-detail?id=${params.id}&name=${params.name}` as never} />;
}
