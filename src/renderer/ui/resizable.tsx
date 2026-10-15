import { GripVerticalIcon } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "./class-names.ts";

export function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("resizable-panel-group", className)}
      {...props}
    />
  );
}

export function ResizablePanel(props: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

export function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & { withHandle?: boolean }) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn("resizable-handle", className)}
      {...props}
    >
      {withHandle ? (
        <div className="resizable-handle__grip">
          <GripVerticalIcon aria-hidden="true" />
        </div>
      ) : null}
    </ResizablePrimitive.Separator>
  );
}
