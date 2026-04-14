#!/bin/bash
echo "Running SLYGHT guardian suite..."
node guardian-all.js
if [ $? -ne 0 ]; then
  echo "❌ Guardian suite failed — fix issues before pushing"
  exit 1
fi
echo "✅ All guardians passed"
