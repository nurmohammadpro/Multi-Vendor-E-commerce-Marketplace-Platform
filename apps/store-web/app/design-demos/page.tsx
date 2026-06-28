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
  note: string;
};

const demos: Demo[] = [
  {
    eyebrow: 'Token direction',
    name: 'Compact commerce',
    note: 'Blue-only accents, low radius, tighter spacing, and lighter type for calm scan speed.',
  },
  {
    eyebrow: 'Surface direction',
    name: 'Quiet panels',
    note: '1px borders and small shadows replace heavy cards so the UI feels focused, not bulky.',
  },
  {
    eyebrow: 'Control direction',
    name: 'Short controls',
    note: 'Inputs and buttons stay small, clear, and aligned to the same compact rhythm everywhere.',
  },
];

export default function DesignDemosPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Design demos</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">
          Compact MotoCore-inspired UI, with our blue palette kept intact.
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The visual language is intentionally restrained so the store app reads like an operator console instead of a
          generic SaaS dashboard.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {demos.map((demo) => (
          <Card key={demo.name}>
            <CardHeader>
              <Badge variant="outline" className="w-fit text-xs">{demo.eyebrow}</Badge>
              <CardTitle className="text-lg">{demo.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">{demo.note}</p>
            </CardContent>
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
            <p className="text-xs text-muted-foreground mt-1">Keeps the interface crisp and controlled.</p>
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
            <p className="text-xs text-muted-foreground mt-1">Lighter weights reduce visual noise.</p>
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
            <p className="text-xs text-muted-foreground mt-1">Smaller paddings keep the workflow focused.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
