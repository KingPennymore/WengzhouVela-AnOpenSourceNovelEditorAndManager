#!/bin/sh
# Prints synthetic data only; this is a source-format fixture.
title="Harbour"
for chapter in Lighthouse Island; do
  printf '%s: %s\n' "$title" "$chapter"
done
