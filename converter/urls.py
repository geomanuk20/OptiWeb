from django.urls import path
from . import views

app_name = 'converter'

urlpatterns = [
    path('', views.index, name='index'),
    path('api/convert/', views.convert_image, name='convert_image'),
    path('api/download-zip/', views.download_zip, name='download_zip'),
]
