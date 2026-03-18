import win32com.client
import os, time, shutil

pptx_path = r'C:\Users\firas\AppData\Local\Temp\AgentRepDeck.pptx'
pdf_path = r'C:\Users\firas\AppData\Local\Temp\AgentRepDeck.pdf'

src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'AgentRep-PitchDeck.pptx')
final_pdf = os.path.join(os.path.dirname(src), 'AgentRep-PitchDeck.pdf')

shutil.copy2(src, pptx_path)

os.system('taskkill /f /im POWERPNT.EXE 2>nul')
time.sleep(2)

powerpoint = win32com.client.Dispatch("PowerPoint.Application")
time.sleep(1)

presentation = powerpoint.Presentations.Open(pptx_path, True, False, False)

# Use SaveAs with format 32 (ppSaveAsPDF) instead of ExportAsFixedFormat
presentation.SaveAs(pdf_path, 32)
presentation.Close()
powerpoint.Quit()

shutil.copy2(pdf_path, final_pdf)
print(f'PDF exported: {final_pdf}')
