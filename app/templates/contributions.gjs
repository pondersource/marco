import ContributionsTimeline from '#components/contributions-timeline';

<template>
  {{#if @controller.mapUi.isSidebarVisible}}
    <ContributionsTimeline
      @items={{@controller.items}}
      @isLoading={{@controller.loadContributionsTask.isRunning}}
      @isConnected={{@controller.isConnected}}
      @scrollTop={{@controller.scrollTop}}
      @onSelect={{@controller.selectContribution}}
      @onBack={{@controller.backToMenu}}
      @onClose={{@controller.close}}
    />
  {{/if}}
</template>
