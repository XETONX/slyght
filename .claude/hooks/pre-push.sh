#!/bin/bash
echo "Running SLYGHT guardian check..."
node guardian.js verify
if [ $? -ne 0 ]; then
  echo "❌ Guardian check failed — fix issues before pushing"
  exit 1
fi
echo "✅ Guardian check passed"
