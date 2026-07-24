import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { m } from '@/paraglide/messages';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConnectorsTab } from './connectors-tab';
import { EquipmentTab } from './equipment-tab';
import { ImportPlanTab } from './import-plan-tab';
import { ProfileTab } from './profile-tab';
import { TrainingZonesTab } from './training-zones-tab';

export function SettingsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'connectors');

  // Update active tab when URL param changes
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

  return (
    <div className="w-full p-4 md:p-8">
      <h1 className="text-2xl font-semibold hidden md:block">{m.settings()}</h1>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-4">
        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <TabsList className="w-max md:w-auto flex-nowrap md:flex-wrap min-w-full md:min-w-0">
            <TabsTrigger value="connectors">{m.connectors()}</TabsTrigger>
            <TabsTrigger value="profile">{m.profile()}</TabsTrigger>
            <TabsTrigger value="equipment">{m.equipment()}</TabsTrigger>
            <TabsTrigger value="import_plan">Import plan</TabsTrigger>
            <TabsTrigger value="training_zones">
              {m.training_zones()}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="connectors" className="mt-6">
          <ConnectorsTab />
        </TabsContent>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="equipment" className="mt-6">
          <EquipmentTab />
        </TabsContent>
        <TabsContent value="import_plan" className="mt-6">
          <ImportPlanTab />
        </TabsContent>
        <TabsContent value="training_zones" className="mt-6">
          <TrainingZonesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
