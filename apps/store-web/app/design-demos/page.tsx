import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Demo = {
  eyebrow: string;
  name: string;
};

const demos: Demo[] = [
  {
    eyebrow: 'Token direction',
    name: 'Compact commerce',
  },
  {
    eyebrow: 'Surface direction',
    name: 'Quiet panels',
  },
  {
    eyebrow: 'Control direction',
    name: 'Short controls',
  },
];

export default function DesignDemosPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Design system</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">
          Compact operator console interface.
        </h2>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {demos.map((demo) => (
          <Card key={demo.name}>
            <CardHeader>
              <Badge variant="outline" className="w-fit text-xs">{demo.eyebrow}</Badge>
              <CardTitle className="text-lg">{demo.name}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Radius
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">6–8px</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Type
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">500–600</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Spacing
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">Tight</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
